module.exports = ({ env }) => ({
  'seo-suggestions': {
    enabled: true,
    resolve: './src/plugins/seo-suggestions',
  },
  'content-reports': {
    enabled: true,
    resolve: './src/plugins/content-reports',
  },
  email: {
    config: {
      provider: 'nodemailer',
      providerOptions: {
        host: env('SMTP_HOST'),
        port: env.int('SMTP_PORT', 587),
        secure: env.bool('SMTP_SECURE', false),
        auth: {
          user: env('SMTP_USERNAME'),
          pass: env('SMTP_PASSWORD'),
        },
      },
      settings: {
        defaultFrom: env('EMAIL_DEFAULT_FROM'),
        defaultReplyTo: env('EMAIL_DEFAULT_REPLY_TO'),
      },
    },
  },
});
