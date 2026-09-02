import type { Schema, Struct } from '@strapi/strapi';

export interface CardsProductSection extends Struct.ComponentSchema {
  collectionName: 'components_cards_product_sections';
  info: {
    displayName: 'Product Section';
    icon: 'grid';
  };
  attributes: {
    banner: Schema.Attribute.Component<'shared.hero', false>;
    card_products: Schema.Attribute.Relation<
      'oneToMany',
      'api::card-product.card-product'
    >;
    description: Schema.Attribute.Text;
    title: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface SharedCta extends Struct.ComponentSchema {
  collectionName: 'components_shared_ctas';
  info: {
    displayName: 'CTA';
    icon: 'cursor';
  };
  attributes: {
    class: Schema.Attribute.Enumeration<['primary', 'secondary']> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'primary'>;
    label: Schema.Attribute.String & Schema.Attribute.Required;
    openInNewTab: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    type: Schema.Attribute.Enumeration<['url', 'action']> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'url'>;
  };
}

export interface SharedHero extends Struct.ComponentSchema {
  collectionName: 'components_shared_heroes';
  info: {
    displayName: 'Hero';
    icon: 'picture';
  };
  attributes: {
    cta: Schema.Attribute.Component<'shared.cta', false>;
    description: Schema.Attribute.Text;
    heading: Schema.Attribute.Text & Schema.Attribute.Required;
    image: Schema.Attribute.Media<'images'> & Schema.Attribute.Required;
    imageAltText: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface SharedSeo extends Struct.ComponentSchema {
  collectionName: 'components_shared_seos';
  info: {
    displayName: 'Seo';
    icon: 'earth';
  };
  attributes: {
    canonicalUrl: Schema.Attribute.String;
    favicon: Schema.Attribute.Media<'images' | 'files' | 'videos' | 'audios'>;
    metaDescription: Schema.Attribute.Text & Schema.Attribute.Required;
    metaTitle: Schema.Attribute.String & Schema.Attribute.Required;
    noIndex: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'cards.product-section': CardsProductSection;
      'shared.cta': SharedCta;
      'shared.hero': SharedHero;
      'shared.seo': SharedSeo;
    }
  }
}
