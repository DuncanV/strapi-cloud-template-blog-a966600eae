'use strict';

const { errors } = require('@strapi/utils');
const { ApplicationError } = errors;

const PAGE_UID = 'api::page.page';

function formatDate(value) {
  return value ? new Date(value).toISOString() : '';
}

// Draft status is used (rather than published) because workflowStatus and the "last edited"
// timestamps live on the editable copy, and every page has one regardless of publish state.
async function getOldestPages() {
  const entries = await strapi.documents(PAGE_UID).findMany({
    status: 'draft',
    fields: ['slug', 'workflowStatus', 'createdAt', 'updatedAt'],
    sort: ['updatedAt:asc', 'createdAt:asc'],
  });

  return entries.map((entry) => ({
    documentId: entry.documentId,
    slug: entry.slug,
    workflowStatus: entry.workflowStatus,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  }));
}

function buildReportEmail(pages) {
  const rows = pages
    .map(
      (page) =>
        `<tr><td>${page.slug}</td><td>${page.workflowStatus}</td><td>${formatDate(page.createdAt)}</td><td>${formatDate(page.updatedAt)}</td></tr>`
    )
    .join('');

  const html =
    '<p>Pages sorted oldest-modified first:</p>' +
    '<table border="1" cellpadding="6" cellspacing="0">' +
    '<thead><tr><th>Slug</th><th>Workflow status</th><th>Created</th><th>Last modified</th></tr></thead>' +
    `<tbody>${rows}</tbody></table>`;

  const text = pages
    .map(
      (page) =>
        `${page.slug} | ${page.workflowStatus} | created ${formatDate(page.createdAt)} | modified ${formatDate(page.updatedAt)}`
    )
    .join('\n');

  return { html, text };
}

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/oldest-pages',
      handler: 'report.oldestPages',
      config: {
        // Any authenticated admin user may call these — both are only reachable from the
        // admin homepage widget anyway.
        auth: { scope: [] },
      },
    },
    {
      method: 'POST',
      path: '/oldest-pages/email',
      handler: 'report.emailOldestPages',
      config: {
        auth: { scope: [] },
      },
    },
  ],
  controllers: {
    report: {
      async oldestPages(ctx) {
        ctx.body = await getOldestPages();
      },

      async emailOldestPages(ctx) {
        const recipient = process.env.REVIEW_NOTIFICATION_EMAIL;
        if (!recipient) {
          throw new ApplicationError('REVIEW_NOTIFICATION_EMAIL is not configured on the server');
        }

        const pages = await getOldestPages();
        const { html, text } = buildReportEmail(pages);

        try {
          await strapi.plugins['email'].services.email.send({
            to: recipient,
            subject: 'Oldest page content report',
            text,
            html,
          });
        } catch (error) {
          strapi.log.error(`Failed to send oldest-pages report email: ${error.message}`);
          throw new ApplicationError('Could not send the report email');
        }

        ctx.body = { sent: true, recipient, count: pages.length };
      },
    },
  },
};
