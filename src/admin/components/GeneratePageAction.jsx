import * as React from 'react';
import { useForm, useFetchClient, useNotification } from '@strapi/admin/strapi-admin';
import { Modal, Field, TextInput, Textarea, Button, Flex, Checkbox, Typography } from '@strapi/design-system';

const PAGE_CONTENT_TYPE_UID = 'api::page.page';

// Rendered inside the Modal.Root/Modal.Content/Modal.Header that Strapi's DocumentActionModal
// already provides — we only render the body + footer, and manage the three inputs locally.
const GeneratePageModalContent = ({ onClose }) => {
  const getValues = useForm('GeneratePageModalContent', (state) => state.getValues);
  const onChange = useForm('GeneratePageModalContent', (state) => state.onChange);
  const { post } = useFetchClient();
  const { toggleNotification } = useNotification();

  const [description, setDescription] = React.useState('');
  const [tone, setTone] = React.useState('');
  const [audience, setAudience] = React.useState('');
  const [includeHeroImage, setIncludeHeroImage] = React.useState(false);
  const [isGenerating, setIsGenerating] = React.useState(false);

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
      onChange('pageBody', data.pageBody);

      const warningSuffix = data.warnings?.length ? ` (${data.warnings.join(' ')})` : '';
      toggleNotification({
        type: data.warnings?.length ? 'warning' : 'success',
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
