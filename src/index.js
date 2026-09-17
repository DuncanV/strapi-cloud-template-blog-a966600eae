'use strict';
const fs = require('fs');
const path = require('path');
const bootstrap = require("./bootstrap");
const { errors } = require('@strapi/utils');
const isEqual = require('lodash/isEqual');

const { ApplicationError } = errors;

const DEBUG_LOG_PATH = path.join(__dirname, '..', '.tmp', 'workflow-status-debug.log');
function debugLog(message) {
  try {
    fs.appendFileSync(DEBUG_LOG_PATH, `[${new Date().toISOString()}] ${message}\n`);
  } catch (e) {
    // best-effort debug logging only
  }
}

// Content types that must have workflowStatus === 'Approved' before they can be published
const APPROVAL_GATED_CONTENT_TYPES = ['api::page.page'];

const SUPER_ADMIN_ROLE_CODE = 'strapi-super-admin';
const PAGE_PUBLISHER_ROLE_NAME = 'Page Publisher';

// Users with neither role are trusted system/internal calls (seed scripts, console, etc.)
// and are not subject to the workflowStatus/publish restrictions.
function currentUserIsPublisherOrSuperAdmin(strapi) {
  const requestCtx = strapi.requestContext.get();
  const user = requestCtx?.state?.user;

  if (!user) {
    return true;
  }

  const roles = user.roles || [];
  return roles.some(
    (role) => role.code === SUPER_ADMIN_ROLE_CODE || role.name === PAGE_PUBLISHER_ROLE_NAME
  );
}

async function resolveEffectiveWorkflowStatus(strapi, context) {
  if (context.params?.data && 'workflowStatus' in context.params.data) {
    return context.params.data.workflowStatus;
  }

  if (context.action === 'update' && context.params?.documentId) {
    const existing = await strapi
      .documents(context.uid)
      .findOne({ documentId: context.params.documentId });
    return existing?.workflowStatus;
  }

  return undefined;
}

const deepPopulateCache = new Map();

// Builds a populate object deep enough to fetch every relation/component/dynamiczone value
// on a content type, so it can be compared against incoming save data field-for-field.
// Caches per uid only (like Strapi's own internal getDeepPopulate) — a component referenced
// from multiple places (e.g. shared.cta used both directly and inside shared.hero) must resolve
// to the same populate object each time, not a boolean shortcut, or the populate query is invalid.
function buildDeepPopulate(strapi, uid) {
  if (deepPopulateCache.has(uid)) {
    return deepPopulateCache.get(uid);
  }

  const model = strapi.getModel(uid);
  const populate = {};

  for (const [attributeName, attribute] of Object.entries(model.attributes)) {
    if (attribute.type === 'relation' || attribute.type === 'media') {
      populate[attributeName] = true;
    } else if (attribute.type === 'component') {
      populate[attributeName] = { populate: buildDeepPopulate(strapi, attribute.component) };
    } else if (attribute.type === 'dynamiczone') {
      populate[attributeName] = {
        on: Object.fromEntries(
          (attribute.components || []).map((componentUID) => [
            componentUID,
            { populate: buildDeepPopulate(strapi, componentUID) },
          ])
        ),
      };
    }
  }

  deepPopulateCache.set(uid, populate);
  return populate;
}

// Normalizes a field's value into something comparable regardless of the shape the Content
// Manager submitted it in (raw id vs. populated object) vs. the shape findOne() returns.
function toComparableValue(strapi, attribute, value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (attribute.type === 'relation') {
    const toIdentifier = (entry) =>
      entry && typeof entry === 'object' ? entry.documentId ?? entry.id ?? null : entry;
    return Array.isArray(value) ? value.map(toIdentifier) : toIdentifier(value);
  }

  if (attribute.type === 'media') {
    const toIdentifier = (entry) => (entry && typeof entry === 'object' ? entry.id ?? null : entry);
    return Array.isArray(value) ? value.map(toIdentifier) : toIdentifier(value);
  }

  if (attribute.type === 'component') {
    return toComparableEntity(strapi, strapi.getModel(attribute.component), value);
  }

  if (attribute.type === 'dynamiczone') {
    if (!Array.isArray(value)) {
      return value;
    }
    return value.map((item) => ({
      __component: item.__component,
      ...toComparableEntity(strapi, strapi.getModel(item.__component), item),
    }));
  }

  return value;
}

function toComparableEntity(strapi, model, entity) {
  if (Array.isArray(entity)) {
    return entity.map((item) => toComparableEntity(strapi, model, item));
  }
  if (!entity || typeof entity !== 'object') {
    return entity;
  }

  const result = {};
  for (const [attributeName, attribute] of Object.entries(model.attributes)) {
    if (attributeName in entity) {
      result[attributeName] = toComparableValue(strapi, attribute, entity[attributeName]);
    }
  }
  return result;
}

// The Content Manager's own form often renders an unset optional field (null in the database)
// with a type-appropriate default such as `false` or `''` even when the user never touched it.
// Treat those as equivalent to null so that doesn't register as a content change.
function normalizeEmptyValues(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeEmptyValues);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, normalizeEmptyValues(val)]));
  }
  if (value === '' || value === false || value === undefined) {
    return null;
  }
  return value;
}

// Strapi-managed bookkeeping fields that appear in the save payload but are never content a
// user edits — they legitimately change (or are duplicated) on every save and must be ignored.
const IGNORED_DIFF_FIELDS = new Set([
  'id',
  'documentId',
  'workflowStatus',
  'createdAt',
  'updatedAt',
  'publishedAt',
  'createdBy',
  'updatedBy',
  'locale',
  'localizations',
]);

// Only the fields actually present in the incoming save payload are checked — comparing them,
// normalized, against the equivalent fields on the stored (fully populated) entry.
function hasContentChangedBesidesWorkflowStatus(strapi, uid, data, existing) {
  const model = strapi.getModel(uid);
  let anyChanged = false;

  for (const key of Object.keys(data)) {
    if (IGNORED_DIFF_FIELDS.has(key)) {
      continue;
    }
    const attribute = model.attributes[key];
    if (!attribute) {
      continue;
    }
    const incoming = normalizeEmptyValues(toComparableValue(strapi, attribute, data[key]));
    const current = normalizeEmptyValues(toComparableValue(strapi, attribute, existing[key]));

    // The Content Manager's relation picker sometimes resubmits `null` for a relation the user
    // never touched (rather than its current value) — that's not evidence of an actual edit.
    if (attribute.type === 'relation' && incoming === null) {
      continue;
    }

    const changed = !isEqual(incoming, current);
    debugLog(
      `field "${key}" changed=${changed} incoming=${JSON.stringify(incoming)} current=${JSON.stringify(current)}`
    );
    if (changed) {
      anyChanged = true;
    }
  }

  return anyChanged;
}

// Any edit to content other than the workflow status itself sends it back to Draft, so
// approved/reviewed content requires re-approval after being touched.
async function resetWorkflowStatusToDraftOnContentEdit(strapi, context) {
  if (context.action !== 'update' || !context.params?.documentId || !context.params?.data) {
    return;
  }

  const { data, documentId } = context.params;
  const populate = buildDeepPopulate(strapi, context.uid);
  const existing = await strapi.documents(context.uid).findOne({ documentId, populate });
  if (!existing) {
    return;
  }

  const incomingStatus = 'workflowStatus' in data ? data.workflowStatus : existing.workflowStatus;
  const isExplicitStatusChange = incomingStatus !== existing.workflowStatus;

  debugLog(
    `--- update documentId=${documentId} existingStatus=${existing.workflowStatus} incomingStatus=${incomingStatus} isExplicitStatusChange=${isExplicitStatusChange} dataKeys=${Object.keys(data).join(',')}`
  );

  if (isExplicitStatusChange || existing.workflowStatus === 'Draft') {
    return;
  }

  if (hasContentChangedBesidesWorkflowStatus(strapi, context.uid, data, existing)) {
    context.params.data = { ...data, workflowStatus: 'Draft' };
  }
}

module.exports = {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register({ strapi }) {
    strapi.documents.use(async (context, next) => {
      if (!APPROVAL_GATED_CONTENT_TYPES.includes(context.uid)) {
        return next();
      }

      if (context.action === 'update') {
        await resetWorkflowStatusToDraftOnContentEdit(strapi, context);
      }

      if (context.action === 'create' || context.action === 'update') {
        const effectiveStatus = await resolveEffectiveWorkflowStatus(strapi, context);

        if (effectiveStatus === 'Approved' && !currentUserIsPublisherOrSuperAdmin(strapi)) {
          throw new ApplicationError('You do not have permission to save content in this state');
        }
      }

      if (context.action === 'publish') {
        if (!currentUserIsPublisherOrSuperAdmin(strapi)) {
          throw new ApplicationError(
            'You do not have the permissions to publish this content, please save it in the appropriate state'
          );
        }

        const { documentId } = context.params;
        const entry = await strapi.documents(context.uid).findOne({ documentId });

        if (!entry) {
          throw new ApplicationError('Content must be Approved before it can be published');
        }

        if (entry.workflowStatus !== 'Approved') {
          throw new ApplicationError(
            `Content is currently in ${entry.workflowStatus} and needs to be approved, please move it to the appropriate state and save`
          );
        }
      }

      return next();
    });
  },

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  bootstrap,
};
