import type { Schema, Struct } from '@strapi/strapi';

export interface CardsIconCard extends Struct.ComponentSchema {
  collectionName: 'components_cards_icon_cards';
  info: {
    displayName: 'Icon Card';
  };
  attributes: {
    description: Schema.Attribute.String;
    heading: Schema.Attribute.String & Schema.Attribute.Required;
    icon: Schema.Attribute.Media<'images'> & Schema.Attribute.Required;
    imageAltText: Schema.Attribute.String & Schema.Attribute.Required;
    link: Schema.Attribute.Component<'shared.link', false>;
  };
}

export interface CardsIconCardSection extends Struct.ComponentSchema {
  collectionName: 'components_cards_icon_card_sections';
  info: {
    displayName: 'Icon Card Section';
  };
  attributes: {
    iconCards: Schema.Attribute.Component<'cards.icon-card', true>;
  };
}

export interface CardsInformationCard extends Struct.ComponentSchema {
  collectionName: 'components_cards_information_cards';
  info: {
    displayName: 'Information Card';
  };
  attributes: {
    description: Schema.Attribute.String & Schema.Attribute.Required;
    heading: Schema.Attribute.String & Schema.Attribute.Required;
    image: Schema.Attribute.Media<'images' | 'files' | 'videos' | 'audios'>;
    imageAltText: Schema.Attribute.String;
    link: Schema.Attribute.Component<'shared.link', false> &
      Schema.Attribute.Required;
  };
}

export interface CardsInformationCardSection extends Struct.ComponentSchema {
  collectionName: 'components_cards_information_card_sections';
  info: {
    displayName: 'Information Card Section';
  };
  attributes: {
    informationCards: Schema.Attribute.Component<
      'cards.information-card',
      true
    >;
  };
}

export interface CardsProductCard extends Struct.ComponentSchema {
  collectionName: 'components_cards_product_cards';
  info: {
    displayName: 'Product Card';
  };
  attributes: {
    accountType: Schema.Attribute.String;
    cta: Schema.Attribute.Component<'shared.cta', true>;
    description: Schema.Attribute.String & Schema.Attribute.Required;
    image: Schema.Attribute.Media<'images'> & Schema.Attribute.Required;
    imageAltText: Schema.Attribute.String & Schema.Attribute.Required;
    monthlyFee: Schema.Attribute.String;
    productName: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface CardsProductCardSection extends Struct.ComponentSchema {
  collectionName: 'components_cards_product_card_sections';
  info: {
    displayName: 'Product Card Section';
  };
  attributes: {
    productCards: Schema.Attribute.Component<'cards.product-card', true>;
  };
}

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
    url: Schema.Attribute.String;
  };
}

export interface SharedDescription extends Struct.ComponentSchema {
  collectionName: 'components_shared_descriptions';
  info: {
    displayName: 'Description';
  };
  attributes: {
    text: Schema.Attribute.Text & Schema.Attribute.Required;
  };
}

export interface SharedFooterSection extends Struct.ComponentSchema {
  collectionName: 'components_shared_footer_sections';
  info: {
    displayName: 'FooterSection';
    icon: 'rocket';
  };
  attributes: {
    heading: Schema.Attribute.String & Schema.Attribute.Required;
    linkSection: Schema.Attribute.Component<'shared.link', true>;
  };
}

export interface SharedHeaderSection extends Struct.ComponentSchema {
  collectionName: 'components_shared_header_sections';
  info: {
    displayName: 'HeaderSection';
    icon: 'alien';
  };
  attributes: {
    heading: Schema.Attribute.String & Schema.Attribute.Required;
    linkSection: Schema.Attribute.Component<'shared.link', true>;
  };
}

export interface SharedHeading extends Struct.ComponentSchema {
  collectionName: 'components_shared_headings';
  info: {
    displayName: 'Heading';
  };
  attributes: {
    text: Schema.Attribute.String & Schema.Attribute.Required;
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

export interface SharedLink extends Struct.ComponentSchema {
  collectionName: 'components_shared_links';
  info: {
    displayName: 'Link';
    icon: 'earth';
  };
  attributes: {
    dataCmsTitle: Schema.Attribute.String;
    displayText: Schema.Attribute.String & Schema.Attribute.Required;
    openInNewTab: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    url: Schema.Attribute.String & Schema.Attribute.Required;
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
    keywords: Schema.Attribute.String;
    metaDescription: Schema.Attribute.Text & Schema.Attribute.Required;
    metaTitle: Schema.Attribute.String & Schema.Attribute.Required;
    noIndex: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
  };
}

export interface SharedVideo extends Struct.ComponentSchema {
  collectionName: 'components_shared_videos';
  info: {
    displayName: 'Video';
  };
  attributes: {
    coverImage: Schema.Attribute.Media<
      'images' | 'files' | 'videos' | 'audios'
    >;
    video: Schema.Attribute.Media<'videos'> & Schema.Attribute.Required;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'cards.icon-card': CardsIconCard;
      'cards.icon-card-section': CardsIconCardSection;
      'cards.information-card': CardsInformationCard;
      'cards.information-card-section': CardsInformationCardSection;
      'cards.product-card': CardsProductCard;
      'cards.product-card-section': CardsProductCardSection;
      'cards.product-section': CardsProductSection;
      'shared.cta': SharedCta;
      'shared.description': SharedDescription;
      'shared.footer-section': SharedFooterSection;
      'shared.header-section': SharedHeaderSection;
      'shared.heading': SharedHeading;
      'shared.hero': SharedHero;
      'shared.link': SharedLink;
      'shared.seo': SharedSeo;
      'shared.video': SharedVideo;
    }
  }
}
