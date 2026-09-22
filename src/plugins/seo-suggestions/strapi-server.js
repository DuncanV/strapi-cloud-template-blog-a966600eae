'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { errors } = require('@strapi/utils');
const { ApplicationError } = errors;

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_IMAGE_API_URL = 'https://api.openai.com/v1/images/generations';
const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_IMAGE_MODEL = 'gpt-image-1';
// The final output size we crop/resize to (OPENAI_IMAGE_SIZE) — unlike the size sent to OpenAI,
// this can be any WIDTHxHEIGHT since we do the cropping ourselves, not the model.
const DEFAULT_TARGET_IMAGE_SIZE = '1536x1024';
// gpt-image-1 only accepts these three fixed sizes (plus "auto") — we always generate at
// whichever one best matches the target's orientation, then crop down to the exact target.
const SUPPORTED_GENERATION_SIZES = {
  square: '1024x1024',
  landscape: '1536x1024',
  portrait: '1024x1536',
};

function parseDimensions(value, fallback) {
  const match = /^(\d+)x(\d+)$/.exec((value || '').trim());
  if (!match) {
    return parseDimensions(fallback);
  }
  return { width: Number(match[1]), height: Number(match[2]) };
}

function pickGenerationSize({ width, height }) {
  if (width === height) return SUPPORTED_GENERATION_SIZES.square;
  return width > height ? SUPPORTED_GENERATION_SIZES.landscape : SUPPORTED_GENERATION_SIZES.portrait;
}

// Pulls the visible copy out of a page's dynamic-zone body, per component type, so the model
// has concrete content to summarize — not every component carries text (e.g. shared.video).
function extractTextFromPageBody(pageBody) {
  const chunks = [];

  const pushIfString = (value) => {
    if (typeof value === 'string' && value.trim()) {
      chunks.push(value.trim());
    }
  };

  for (const block of pageBody || []) {
    switch (block?.__component) {
      case 'shared.heading':
      case 'shared.description':
        pushIfString(block.text);
        break;
      case 'shared.hero':
        pushIfString(block.heading);
        pushIfString(block.description);
        pushIfString(block.cta?.label);
        break;
      case 'shared.link':
        pushIfString(block.displayText);
        break;
      case 'shared.cta':
        pushIfString(block.label);
        break;
      case 'cards.icon-card-section':
        for (const card of block.iconCards || []) {
          pushIfString(card.heading);
          pushIfString(card.description);
        }
        break;
      case 'cards.information-card-section':
        for (const card of block.informationCards || []) {
          pushIfString(card.heading);
          pushIfString(card.description);
        }
        break;
      case 'cards.product-card-section':
        for (const card of block.productCards || []) {
          pushIfString(card.productName);
          pushIfString(card.description);
        }
        break;
      default:
        break;
    }
  }

  return chunks.join('\n');
}

// Calls OpenAI's chat completions endpoint asking for a strict JSON object, and returns the
// parsed object. Shared by both the SEO-suggestion and page-generation actions.
async function callOpenAiForJson({ systemPrompt, userContent, logLabel }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ApplicationError('OPENAI_API_KEY is not configured on the server');
  }

  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;

  let response;
  try {
    response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent.slice(0, 6000) },
        ],
      }),
    });
  } catch (error) {
    strapi.log.error(`OpenAI ${logLabel} request could not be sent: ${error.message}`);
    throw new ApplicationError(`Could not reach OpenAI to ${logLabel}`);
  }

  if (!response.ok) {
    const errorBody = await response.text();
    strapi.log.error(`OpenAI ${logLabel} request failed: ${response.status} ${errorBody}`);
    throw new ApplicationError(`Failed to ${logLabel} from OpenAI`);
  }

  const payload = await response.json();
  const rawContent = payload.choices?.[0]?.message?.content;

  try {
    return JSON.parse(rawContent);
  } catch (error) {
    strapi.log.error(`OpenAI ${logLabel} returned unparseable content: ${rawContent}`);
    throw new ApplicationError('OpenAI returned an unexpected response format');
  }
}

// Generates a hero image with OpenAI's image API and uploads it into the Media Library,
// returning the created file entity (the shape the Media field expects for display).
async function generateAndUploadHeroImage({ prompt, nameHint }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ApplicationError('OPENAI_API_KEY is not configured on the server');
  }

  const imageModel = process.env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;
  const targetDimensions = parseDimensions(process.env.OPENAI_IMAGE_SIZE, DEFAULT_TARGET_IMAGE_SIZE);
  const generationSize = pickGenerationSize(targetDimensions);

  // The final on-page hero banner is much shorter/wider than anything OpenAI generates directly
  // (a ~1.5:1 image ends up inside a container as wide as ~5:1 on desktop), and both our own
  // crop and the page's CSS are anchored to the top of the image — so only a fairly thin band
  // across the top of the generated image ends up visible. Ask the model to render the subject
  // small and clearly within that band, rather than filling/centering the whole frame.
  const promptWithCropGuidance =
    `${prompt} Compose the image with the main subject noticeably small, positioned in the top ` +
    'third of the frame, well within the top 25% of the image height — the rest of the frame ' +
    '(the middle and bottom) should be simple, empty background. Only a narrow strip across the ' +
    'very top of this image will actually be shown, cropped as a wide, short banner, so nothing ' +
    'important can extend below the upper quarter of the frame.';

  let response;
  try {
    response = await fetch(OPENAI_IMAGE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: imageModel,
        prompt: promptWithCropGuidance,
        size: generationSize,
        n: 1,
      }),
    });
  } catch (error) {
    strapi.log.error(`OpenAI image generation request could not be sent: ${error.message}`);
    throw new ApplicationError('Could not reach OpenAI to generate the hero image');
  }

  if (!response.ok) {
    const errorBody = await response.text();
    strapi.log.error(`OpenAI image generation failed: ${response.status} ${errorBody}`);
    let detail = '';
    try {
      detail = JSON.parse(errorBody)?.error?.message || '';
    } catch (e) {
      // errorBody wasn't JSON — leave detail empty
    }
    throw new ApplicationError(
      `Failed to generate the hero image from OpenAI${detail ? `: ${detail}` : ''}`
    );
  }

  const payload = await response.json();
  const item = payload.data?.[0];

  let rawBuffer;
  if (item?.b64_json) {
    rawBuffer = Buffer.from(item.b64_json, 'base64');
  } else if (item?.url) {
    const imageResponse = await fetch(item.url);
    rawBuffer = Buffer.from(await imageResponse.arrayBuffer());
  } else {
    throw new ApplicationError('OpenAI did not return an image');
  }

  // Crop (like CSS object-fit: cover) from the generated size down to the exact target
  // dimensions, anchored to the top — combined with the composition guidance above, this keeps
  // the subject in frame while cropping away the bottom of the image rather than both edges.
  let buffer;
  try {
    buffer = await sharp(rawBuffer)
      .resize(targetDimensions.width, targetDimensions.height, { fit: 'cover', position: 'top' })
      .png()
      .toBuffer();
  } catch (error) {
    strapi.log.error(`Cropping the generated hero image failed: ${error.message}`);
    throw new ApplicationError('Generated the hero image, but could not resize it to the target dimensions');
  }

  const safeName = (nameHint || 'hero-image').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50);
  const tmpPath = path.join(os.tmpdir(), `${safeName}-${Date.now()}.png`);
  await fs.promises.writeFile(tmpPath, buffer);

  try {
    const [uploaded] = await strapi.plugin('upload').service('upload').upload({
      files: {
        filepath: tmpPath,
        originalFileName: `${safeName}.png`,
        size: buffer.length,
        mimetype: 'image/png',
      },
      data: {
        fileInfo: {
          alternativeText: prompt.slice(0, 200),
          caption: nameHint || 'AI-generated hero image',
          name: safeName,
        },
      },
    });
    return uploaded;
  } finally {
    await fs.promises.unlink(tmpPath).catch(() => {});
  }
}

// Hero image generation can take well over a minute, which exceeds Strapi Cloud's platform
// request timeout — so it must never be awaited inside a single HTTP request/response cycle.
// Instead we run it in the background and hand the caller a job id to poll (see the
// /hero-image-job/:jobId route below).
const heroImageJobs = new Map();

function startHeroImageJob({ prompt, nameHint }) {
  const jobId = crypto.randomUUID();
  heroImageJobs.set(jobId, { status: 'pending' });

  generateAndUploadHeroImage({ prompt, nameHint })
    .then((uploaded) => {
      heroImageJobs.set(jobId, {
        status: 'done',
        image: uploaded,
        imageAltText: toSafeString(nameHint, 'Hero image').slice(0, 200),
      });
    })
    .catch((error) => {
      strapi.log.error(`Hero image generation job ${jobId} failed: ${error.message}`);
      heroImageJobs.set(jobId, { status: 'error', error: error.message });
    });

  return jobId;
}

async function suggestSeoFields(pageBody) {
  const contentText = extractTextFromPageBody(pageBody);
  if (!contentText) {
    throw new ApplicationError('This page has no text content yet to base SEO suggestions on');
  }

  const parsed = await callOpenAiForJson({
    logLabel: 'generate SEO suggestions',
    userContent: contentText,
    systemPrompt:
      'You are an SEO specialist. Given the visible text content of a web page, suggest SEO metadata. ' +
      'Respond with strict JSON only: {"metaTitle": string (<= 60 characters), ' +
      '"metaDescription": string (<= 160 characters), "keywords": string (comma-separated, 5-10 terms)}. ' +
      'Do not include any text outside the JSON object.',
  });

  return {
    metaTitle: typeof parsed.metaTitle === 'string' ? parsed.metaTitle : '',
    metaDescription: typeof parsed.metaDescription === 'string' ? parsed.metaDescription : '',
    keywords: typeof parsed.keywords === 'string' ? parsed.keywords : '',
  };
}

const SLUG_MAX_LENGTH = 80;
const MAX_CARDS_PER_SECTION = 4;

function toSafeString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function toSlug(value, fallback) {
  const slug = toSafeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH);
  return slug || fallback;
}

// The AI is explicitly told never to invent real URLs, so every link/cta gets this placeholder
// instead — a valid, always-safe destination the editor can swap out before publishing.
const PLACEHOLDER_URL = 'https://www.absa.co.za/';

function sanitizeLink(rawLink) {
  return {
    displayText: toSafeString(rawLink?.displayText, 'Learn more'),
    url: PLACEHOLDER_URL,
    openInNewTab: false,
  };
}

function sanitizeCta(rawCta, fallbackLabel = 'Learn more') {
  return {
    label: toSafeString(rawCta?.label, fallbackLabel),
    class: rawCta?.class === 'secondary' ? 'secondary' : 'primary',
    type: 'url',
    openInNewTab: false,
    url: PLACEHOLDER_URL,
  };
}

const DEFAULT_PRODUCT_CARD_IMAGE_NAME = 'default_product_card.png';
const DEFAULT_INFO_CARD_IMAGE_NAME = 'default_info_card.png';
const DEFAULT_ICON_CARD_IMAGE_NAME = 'default_icon_card.png';

// Product/information/icon cards can carry an image, but the AI has no way to reference a real
// Media Library asset, so generated cards fall back to a pre-uploaded placeholder by name.
async function getDefaultCardImage(name) {
  const file = await strapi.db.query('plugin::upload.file').findOne({ where: { name } });

  if (!file) {
    strapi.log.warn(`Default card image "${name}" was not found in the Media Library`);
  }

  return file;
}

// Rebuilds the AI's response into exactly the shapes our supported components expect, rather
// than trusting the raw output — coercing types/enums and dropping any unknown or
// media-dependent fields (the model has no way to reference real assets in the Media Library).
// Product, information, and icon cards are all filled in afterwards with a default placeholder
// image (see getDefaultCardImage) since the AI has no way to reference a real asset itself.
function sanitizePageBody(rawPageBody) {
  const blocks = [];

  for (const rawBlock of Array.isArray(rawPageBody) ? rawPageBody : []) {
    switch (rawBlock?.__component) {
      case 'shared.hero':
        blocks.push({
          __component: 'shared.hero',
          heading: toSafeString(rawBlock.heading, 'Welcome'),
          description: toSafeString(rawBlock.description),
          cta: sanitizeCta(rawBlock.cta),
        });
        break;
      case 'shared.heading':
        blocks.push({ __component: 'shared.heading', text: toSafeString(rawBlock.text, 'Heading') });
        break;
      case 'shared.description':
        blocks.push({ __component: 'shared.description', text: toSafeString(rawBlock.text) });
        break;
      case 'cards.information-card-section': {
        const cards = (Array.isArray(rawBlock.informationCards) ? rawBlock.informationCards : [])
          .slice(0, MAX_CARDS_PER_SECTION)
          .map((card) => ({
            heading: toSafeString(card.heading, 'Feature'),
            description: toSafeString(card.description),
            link: sanitizeLink(card.link),
          }));
        if (cards.length > 0) {
          blocks.push({ __component: 'cards.information-card-section', informationCards: cards });
        }
        break;
      }
      case 'cards.icon-card-section': {
        const cards = (Array.isArray(rawBlock.iconCards) ? rawBlock.iconCards : [])
          .slice(0, MAX_CARDS_PER_SECTION)
          .map((card) => ({
            heading: toSafeString(card.heading, 'Feature'),
            description: toSafeString(card.description),
            imageAltText: toSafeString(card.heading, 'Feature icon'),
            link: sanitizeLink(card.link),
          }));
        if (cards.length > 0) {
          blocks.push({ __component: 'cards.icon-card-section', iconCards: cards });
        }
        break;
      }
      case 'cards.product-card-section': {
        const cards = (Array.isArray(rawBlock.productCards) ? rawBlock.productCards : [])
          .slice(0, MAX_CARDS_PER_SECTION)
          .map((card) => ({
            productName: toSafeString(card.productName, 'Account'),
            description: toSafeString(card.description, 'A great account option for your business.'),
            imageAltText: toSafeString(card.productName, 'Product image'),
            monthlyFee: toSafeString(card.monthlyFee),
            accountType: toSafeString(card.accountType),
            cta: [sanitizeCta(card.cta?.[0] ?? card.cta, 'Find out more')],
          }));
        if (cards.length > 0) {
          blocks.push({ __component: 'cards.product-card-section', productCards: cards });
        }
        break;
      }
      default:
        break;
    }
  }

  return blocks;
}

async function generatePageContent({ description, tone, audience, includeHeroImage }) {
  const brief = [
    `Page purpose: ${description}`,
    tone ? `Tone: ${tone}` : null,
    audience ? `Target audience: ${audience}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const parsed = await callOpenAiForJson({
    logLabel: 'generate page content',
    userContent: brief,
    systemPrompt:
      'You are a copywriter drafting sample marketing page content for a bank\'s business-banking website. ' +
      'Given a page purpose, tone, and target audience, respond with strict JSON only, matching exactly this shape ' +
      '(no other keys, no markdown, no commentary):\n' +
      '{\n' +
      '  "slug": string (short, kebab-case, url-safe),\n' +
      '  "pageBody": [\n' +
      '    { "__component": "shared.hero", "heading": string, "description": string, "cta": { "label": string, "class": "primary" | "secondary" } },\n' +
      '    { "__component": "shared.heading", "text": string },\n' +
      '    { "__component": "shared.description", "text": string },\n' +
      '    <one or more card sections — see below>\n' +
      '  ]\n' +
      '}\n' +
      'For card sections, there are three available styles, and the page can mix as many of them as fit its purpose — do not limit yourself to just one style:\n' +
      '- Feature/benefit highlights ("quick actions"): { "__component": "cards.icon-card-section", "iconCards": [ { "heading": string, "description": string, "link": { "displayText": string } }, ... exactly 3 ] }\n' +
      '- General informational cards: { "__component": "cards.information-card-section", "informationCards": [ { "heading": string, "description": string, "link": { "displayText": string } }, ... exactly 3 ] }\n' +
      '- Named account/product comparison: { "__component": "cards.product-card-section", "productCards": [ { "productName": string, "description": string, "monthlyFee": string (e.g. "R99/month" or "Free"), "accountType": string, "cta": { "label": string } }, ... exactly 2 ] }\n' +
      'Decide which styles to include based on the page purpose: use product cards if it involves comparing or showcasing named accounts/products, icon cards if it involves quick actions or a list of features/benefits, ' +
      'and information cards for general informational content. If the page purpose explicitly mentions "product cards", "information"/"informational cards", and/or "quick actions", ' +
      'you must include the corresponding section(s) (product cards, information cards, and icon cards respectively) in addition to any others that fit — never fewer than what was explicitly requested.\n' +
      'Include exactly one hero at the top. You can use multiple heading and description blocks, plus one or more card section blocks of the same or different styles, in that order - repeating if you want. ' +
      'Never invent real URLs — omit or leave URL-shaped fields blank.',
  });

  const pageBody = sanitizePageBody(parsed.pageBody);
  const warnings = [];

  const productCardSections = pageBody.filter((block) => block.__component === 'cards.product-card-section');
  if (productCardSections.length > 0) {
    const defaultProductCardImage = await getDefaultCardImage(DEFAULT_PRODUCT_CARD_IMAGE_NAME);
    if (defaultProductCardImage) {
      for (const section of productCardSections) {
        for (const card of section.productCards) {
          card.image = defaultProductCardImage;
        }
      }
    } else {
      warnings.push(
        'Product cards were generated without an image because the default product card image could not be found.'
      );
    }
  }

  const informationCardSections = pageBody.filter(
    (block) => block.__component === 'cards.information-card-section'
  );
  if (informationCardSections.length > 0) {
    const defaultInfoCardImage = await getDefaultCardImage(DEFAULT_INFO_CARD_IMAGE_NAME);
    if (defaultInfoCardImage) {
      for (const section of informationCardSections) {
        for (const card of section.informationCards) {
          card.image = defaultInfoCardImage;
        }
      }
    } else {
      warnings.push(
        'Information cards were generated without an image because the default information card image could not be found.'
      );
    }
  }

  const iconCardSections = pageBody.filter((block) => block.__component === 'cards.icon-card-section');
  if (iconCardSections.length > 0) {
    const defaultIconCardImage = await getDefaultCardImage(DEFAULT_ICON_CARD_IMAGE_NAME);
    if (defaultIconCardImage) {
      for (const section of iconCardSections) {
        for (const card of section.iconCards) {
          card.icon = defaultIconCardImage;
        }
      }
    } else {
      warnings.push(
        'Icon cards were generated without an image because the default icon card image could not be found.'
      );
    }
  }

  let heroImageJobId = null;
  if (includeHeroImage) {
    const hero = pageBody.find((block) => block.__component === 'shared.hero');
    if (hero) {
      const imagePrompt =
        `A professional marketing photo for a bank's business-banking website hero banner. ` +
        `Page purpose: ${description}. ${tone ? `Tone: ${tone}. ` : ''}${audience ? `Audience: ${audience}. ` : ''}` +
        'No text, no logos, no watermarks in the image.';

      heroImageJobId = startHeroImageJob({ prompt: imagePrompt, nameHint: hero.heading });
    }
  }

  return {
    slug: toSlug(parsed.slug, 'new-page'),
    pageBody,
    warnings,
    heroImageJobId,
  };
}

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/suggest-seo',
      handler: 'seo.suggest',
      config: {
        // Any authenticated admin user may call these (no extra RBAC permission needed) — both
        // buttons are only reachable from within the page edit view anyway.
        auth: { scope: [] },
      },
    },
    {
      method: 'POST',
      path: '/generate-page',
      handler: 'seo.generatePage',
      config: {
        auth: { scope: [] },
      },
    },
    {
      method: 'GET',
      path: '/hero-image-job/:jobId',
      handler: 'seo.heroImageJobStatus',
      config: {
        auth: { scope: [] },
      },
    },
  ],
  controllers: {
    seo: {
      async suggest(ctx) {
        const { pageBody } = ctx.request.body || {};

        if (!Array.isArray(pageBody)) {
          return ctx.badRequest('pageBody must be an array');
        }

        const suggestions = await suggestSeoFields(pageBody);
        ctx.body = suggestions;
      },

      async generatePage(ctx) {
        const { description, tone, audience, includeHeroImage } = ctx.request.body || {};

        if (!toSafeString(description)) {
          return ctx.badRequest('description is required');
        }

        const generated = await generatePageContent({
          description,
          tone,
          audience,
          includeHeroImage: !!includeHeroImage,
        });
        ctx.body = generated;
      },

      async heroImageJobStatus(ctx) {
        const { jobId } = ctx.params;
        const job = heroImageJobs.get(jobId);

        if (!job) {
          return ctx.notFound('Unknown or expired hero image job');
        }

        ctx.body = job;
      },
    },
  },
};
