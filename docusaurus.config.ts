import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'Anndev Docs',
  tagline: 'Arquitectura de software con .NET, Python y SQL — en español',

  // Set the production url of your site here
  url: 'https://your-docusaurus-site.example.com',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/anndev-docs/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'Anndev14', // Usually your GitHub org/user name.
  projectName: 'anndev-docs', // Usually your repo name.
  trailingSlash: false,

  onBrokenLinks: 'throw',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/Anndev14/anndev-docs/tree/main/',
        },
        blog: {
          showReadingTime: true,
          feedOptions: {
            type: ['rss', 'atom'],
            xslt: true,
          },
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/Anndev14/anndev-docs/tree/main/',
          // Useful options to enforce blogging best practices
          onInlineTags: 'warn',
          onInlineAuthors: 'warn',
          onUntruncatedBlogPosts: 'warn',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Replace with your project's social card
    image: 'img/logo.png',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Anndev Docs',
      logo: {
        alt: 'My Site Logo',
        src: 'img/logo.png',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Documentación',
        },
        { to: '/blog', label: 'Blog', position: 'left' },
        { to: '/roadmap', label: 'Roadmap', position: 'left' },
        {
          href: 'https://github.com/Anndev14/anndev-docs',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Contenido',
          items: [
            {
              label: 'Documentación',
              to: '/docs/dotnet/Fundamentos/como-funciona-web-api',
            },
            {
              label: 'Blog',
              to: '/blog',
            },
            {
              label: 'Roadmap',
              to: '/roadmap',
            },
          ],
        },
        {
          title: 'Redes',
          items: [
            {
              label: 'YouTube',
              href: 'https://youtube.com/@anndev14',
            },
            {
              label: 'GitHub',
              href: 'https://github.com/Anndev14/anndev-docs',
            },
            {
              label: 'LinkedIn',
              href: 'https://linkedin.com/in/anderson-frias',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Anndev — arquitectura de software con .NET, Python y SQL`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['csharp', 'python', 'bash', 'json', 'sql'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
