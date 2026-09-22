import * as React from 'react';
import { useForm, useFetchClient, useNotification } from '@strapi/admin/strapi-admin';
import { Modal, Field, TextInput, Textarea, Button, Flex, Checkbox, Typography } from '@strapi/design-system';

const PAGE_CONTENT_TYPE_UID = 'api::page.page';

// Rendered inside the Modal.Root/Modal.Content/Modal.Header that Strapi's DocumentActionModal
// already provides — we only render the body + footer, and manage the three inputs locally.
const GeneratePageModalContent = ({ onClose }) => {
  const getValues = useForm('GeneratePageModalContent', (state) => state.getValues);
  const onChange = useForm('GeneratePageModalContent', (state) => state.onChange);
  const { post, get } = useFetchClient();
  const { toggleNotification } = useNotification();

  const [description, setDescription] = React.useState('');
  const [tone, setTone] = React.useState('');
  const [audience, setAudience] = React.useState('');
  const [includeHeroImage, setIncludeHeroImage] = React.useState(false);
  const [isGenerating, setIsGenerating] = React.useState(false);

  // Image generation can take well over a minute, which is longer than a single HTTP request is
  // allowed to stay open on Strapi Cloud — so /generate-page kicks the image off in the
  // background and hands back a job id, and we poll this small status endpoint (each request
  // is quick) until it's done rather than waiting on one long request.
  const pollHeroImageJob = async (jobId) => {
    for (;;) {
      const { data: job } = await get(`/seo-suggestions/hero-image-job/${jobId}`);
      if (job.status !== 'pending') {
        return job;
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  };

  const handleGenerate = async () => {
    if (!description.trim()) {
      toggleNotification({ type: 'danger', message: 'Describe what the page is for first.' });
      return;
    }

    setIsGenerating(true);
    try {
      const { data } = await post('/seo-suggestions/generate-page', {
        description,
        tone,
        audience,
        includeHeroImage,
      });

      const values = getValues();
      if (!values.slug && data.slug) {
        onChange('slug', data.slug);
      }

      const warnings = [...(data.warnings || [])];

      if (data.heroImageJobId) {
        toggleNotification({
          type: 'info',
          message: 'Page content created, awaiting image creation.',
        });
        const job = await pollHeroImageJob(data.heroImageJobId);
        if (job.status === 'done') {
          const hero = data.pageBody.find((block) => block.__component === 'shared.hero');
          if (hero) {
            hero.image = job.image;
            hero.imageAltText = job.imageAltText;
          }
        } else {
          warnings.push(`Page content was generated, but the hero image could not be created (${job.error}).`);
        }
      }

      onChange('pageBody', data.pageBody);

      const warningSuffix = warnings.length ? ` (${warnings.join(' ')})` : '';
      toggleNotification({
        type: warnings.length ? 'warning' : 'success',
        message: `Sample page content generated — review it, then save.${warningSuffix}`,
      });
      onClose();
    } catch (error) {
      toggleNotification({
        type: 'danger',
        message: error?.response?.data?.error?.message || 'Could not generate page content.',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      <Modal.Body>
        <Flex direction="column" alignItems="stretch" gap={4}>
          <Field.Root>
            <Field.Label>Page description</Field.Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. A landing page promoting our new small-business savings account"
            />
          </Field.Root>
          <Field.Root>
            <Field.Label>Tone</Field.Label>
            <TextInput
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              placeholder="e.g. professional and reassuring"
            />
          </Field.Root>
          <Field.Root>
            <Field.Label>Audience</Field.Label>
            <TextInput
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="e.g. small business owners"
            />
          </Field.Root>
          <Flex gap={2} alignItems="flex-start">
            <Checkbox checked={includeHeroImage} onCheckedChange={setIncludeHeroImage}>
              Generate a hero image with AI
            </Checkbox>
          </Flex>
          {includeHeroImage && (
            <Typography variant="pi" textColor="neutral600">
              This calls OpenAI's image generation API in addition to text generation, which is
              slower and costs more per click.
            </Typography>
          )}
        </Flex>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="tertiary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleGenerate} loading={isGenerating}>
          Generate
        </Button>
      </Modal.Footer>
    </>
  );
};

// Only offered on the create view — generating over an existing page's content is a separate,
// riskier action we haven't built confirmation/merge behavior for yet.
const GeneratePageAction = ({ model, documentId }) => {
  if (model !== PAGE_CONTENT_TYPE_UID || documentId) {
    return null;
  }

  return {
    label: 'Generate Page with AI',
    icon: null,
    position: 'panel',
    dialog: {
      type: 'modal',
      title: 'Generate sample page content',
      content: GeneratePageModalContent,
    },
  };
};

export default GeneratePageAction;
