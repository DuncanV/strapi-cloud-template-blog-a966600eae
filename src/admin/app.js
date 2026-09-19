import { useForm, useFetchClient, useNotification } from '@strapi/admin/strapi-admin';
import { Clock } from '@strapi/icons';
import GeneratePageAction from './components/GeneratePageAction';

const config = {
  locales: [],
};

const PAGE_CONTENT_TYPE_UID = 'api::page.page';

// A Document Action is rendered by Strapi as a real component (so hooks work), but instead of
// returning JSX it returns a plain description object ({ label, onClick, ... }) that Strapi
// itself renders as the actual button.
const SuggestSeoAction = ({ model }) => {
  const getValues = useForm('SuggestSeoAction', (state) => state.getValues);
  const onChange = useForm('SuggestSeoAction', (state) => state.onChange);
  const { post } = useFetchClient();
  const { toggleNotification } = useNotification();

  if (model !== PAGE_CONTENT_TYPE_UID) {
    return null;
  }

  return {
    label: 'Suggest SEO',
    icon: null,
    position: 'panel',
    onClick: async () => {
      const values = getValues();
      const seo = values.seo || {};

      try {
        const { data } = await post('/seo-suggestions/suggest-seo', {
          pageBody: values.pageBody || [],
        });

        let filledAny = false;
        if (!seo.metaTitle && data.metaTitle) {
          onChange('seo.metaTitle', data.metaTitle);
          filledAny = true;
        }
        if (!seo.metaDescription && data.metaDescription) {
          onChange('seo.metaDescription', data.metaDescription);
          filledAny = true;
        }
        if (!seo.keywords && data.keywords) {
          onChange('seo.keywords', data.keywords);
          filledAny = true;
        }

        toggleNotification({
          type: filledAny ? 'success' : 'info',
          message: filledAny
            ? 'SEO suggestions added — review and save.'
            : 'metaTitle, metaDescription and keywords are already filled in — nothing to suggest.',
        });
      } catch (error) {
        toggleNotification({
          type: 'danger',
          message: error?.response?.data?.error?.message || 'Could not generate SEO suggestions.',
        });
      }
    },
  };
};

const bootstrap = (app) => {
  const contentManagerPlugin = app.getPlugin('content-manager');
  contentManagerPlugin.apis.addDocumentAction((actions) => [
    ...actions,
    SuggestSeoAction,
    GeneratePageAction,
  ]);
};

const register = (app) => {
  app.widgets.register([
    {
      icon: Clock,
      title: { id: 'content-reports.oldest-pages.title', defaultMessage: 'Oldest page content' },
      component: async () => (await import('./components/OldestPagesWidget')).default,
      pluginId: 'content-reports',
      id: 'oldest-pages',
    },
  ]);
};

export default {
  config,
  bootstrap,
  register,
};
