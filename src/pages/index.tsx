import React, { JSX } from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import styles from './index.module.css';

function Hero() {
  return (
    <div className={styles.hero}>
      <div className={styles.badge}>
        <span className={styles.badgeDot} />
        Documentación en proceso
      </div>
      <h1 className={styles.heroTitle}>
        Arquitectura de software<br />
        con <span className={styles.accent}>.NET · Python · SQL</span> — en español
      </h1>
      <p className={styles.heroSub}>
        .NET, Python, FastAPI y SQL — patrones de diseño, arquitectura SaaS y casos reales de código.
        Sin teoría vacía, con ejemplos que puedes clonar y usar hoy.
      </p>
      <div className={styles.ctaRow}>
        <Link className={styles.btnPrimary} to="/docs/dotnet/Fundamentos/como-funciona-web-api">
          Empezar desde cero →
        </Link>
        <Link className={styles.btnSecondary} to="/roadmap">
          Ver el roadmap
        </Link>
      </div>
    </div>
  );
}

const FEATURES = [
  {
    color: 'blue',
    title: 'Patrones de diseño',
    desc: 'Repository, Unit of Work, Specification, Strategy y más — aplicados en proyectos reales.',
    icon: (
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    color: 'teal',
    title: 'Arquitectura SaaS',
    desc: 'Multi-tenancy, autenticación, jobs programados y configuración por ambiente.',
    icon: (
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    color: 'amber',
    title: 'Código real clonable',
    desc: 'Cada ejemplo viene de apps en producción. Sin abstracciones inventadas para el tutorial.',
    icon: (
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
  {
    color: 'coral',
    title: 'Patrones bajo presión',
    desc: 'Casos reales de DB legacy, sistemas sin FK, y código que tiene que sobrevivir a la realidad.',
    icon: (
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
];

function Features() {
  return (
    <section className={styles.section}>
      <p className={styles.sectionLabel}>Lo que vas a encontrar</p>
      <h2 className={styles.sectionTitle}>Todo lo que necesitas para construir software real</h2>
      <p className={styles.sectionSub}>
        Desde los fundamentos hasta un SaaS completo. Cada tema con código real.
      </p>
      <div className={styles.cards}>
        {FEATURES.map((f) => (
          <div key={f.title} className={styles.card}>
            <div className={`${styles.cardIcon} ${styles[f.color]}`}>
              {f.icon}
            </div>
            <h3 className={styles.cardTitle}>{f.title}</h3>
            <p className={styles.cardDesc}>{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const STEPS = [
  {
    num: 1,
    title: 'Fundamentos — .NET, Python y SQL',
    desc: 'DI nativa, Repository, Unit of Work, FastAPI, diseño de bases de datos — la base de todo.',
  },
  {
    num: 2,
    title: 'Patrones de diseño aplicados',
    desc: 'Specification, Strategy, Decorator, CQRS — aplicados en .NET y Python por igual.',
  },
  {
    num: 3,
    title: 'Patrones bajo presión — casos legacy reales',
    desc: 'DB sin FK, órdenes en plano, campos que no son lo que dicen ser. La realidad de migrar sistemas.',
  },
  {
    num: 4,
    title: 'Arquitectura modular',
    desc: 'Monolito modular bien hecho. Separación por módulos, contratos entre capas, sin microservicios.',
  },
  {
    num: 5,
    title: 'Diseño de SaaS completo',
    desc: 'Multi-tenancy, auth, jobs, secrets, background services — construido paso a paso.',
  },
];

function Roadmap() {
  return (
    <section className={styles.section}>
      <hr className={styles.divider} />
      <p className={styles.sectionLabel}>Roadmap</p>
      <h2 className={styles.sectionTitle}>De cero a SaaS</h2>
      <p className={styles.sectionSub}>
        La ruta completa. Puedes entrar en cualquier punto según tu nivel.
      </p>
      <div className={styles.steps}>
        {STEPS.map((s) => (
          <div key={s.num} className={styles.step}>
            <div className={styles.stepNum}>{s.num}</div>
            <div>
              <h4 className={styles.stepTitle}>{s.title}</h4>
              <p className={styles.stepDesc}>{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Stack() {
  return (
    <section className={styles.section}>
      <hr className={styles.divider} />
      <p className={styles.sectionLabel}>Stack</p>
      <h2 className={styles.sectionTitle}>Lo que usamos</h2>
      <p className={styles.sectionSub}>
        .NET, Python, FastAPI y SQL. Sin frameworks extra — solo lo que usas en un proyecto real.
      </p>
      <div className={styles.codeBlock}>
        <span className={styles.cGray}>{'// Stack de la documentación'}</span>
        <br />
        <span className={styles.cBlue}>var</span>
        {' stack = '}
        <span className={styles.cBlue}>new</span>
        {' {'}
        <br />
        {'  Runtime     = '}
        <span className={styles.cGreen}>"NET 8 / Python 3"</span>
        {','}
        <br />
        {'  Backend     = '}
        <span className={styles.cGreen}>"ASP.NET Core / FastAPI"</span>
        {','}
        <br />
        {'  ORM         = '}
        <span className={styles.cGreen}>"EF Core / SQLAlchemy"</span>
        {','}
        <br />
        {'  DB          = '}
        <span className={styles.cGreen}>"SQL Server / PostgreSQL"</span>
        {','}
        <br />
        {'  Auth        = '}
        <span className={styles.cGreen}>"JWT + Identity"</span>
        {','}
        <br />
        {'  Docs        = '}
        <span className={styles.cGreen}>"Docusaurus + GitHub Pages"</span>
        <br />
        {'};'}
      </div>
    </section>
  );
}

function Support() {
  return (
    <section className={styles.section}>
      <hr className={styles.divider} />
      <div className={styles.supportRow}>
        <div className={styles.supportCard}>
          <h4 className={styles.supportTitle}>Canal de YouTube</h4>
          <p className={styles.supportDesc}>
            Los videos complementan la doc. Cada tema importante tiene su video explicando el razonamiento.
          </p>
          <a
            className={styles.supportLink}
            href="https://youtube.com/@anndev14"
            target="_blank"
            rel="noreferrer"
          >
            Ver canal ↗
          </a>
        </div>
        <div className={styles.supportCard}>
          <h4 className={styles.supportTitle}>Apoya el proyecto</h4>
          <p className={styles.supportDesc}>
            La documentación es gratis y siempre lo será. Si te ayuda, puedes invitarme un café.
          </p>
          <a
            className={styles.supportLink}
            href="https://ko-fi.com/anndev"
            target="_blank"
            rel="noreferrer"
          >
            Ko-fi ↗
          </a>
        </div>
      </div>
    </section>
  );
}

export default function Home(): JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  return (
        <Layout title="Inicio" description="Arquitectura de software con .NET, Python y SQL — en español">
      <main className={styles.main}>
        <Hero />
        <Features />
        <Roadmap />
        <Stack />
        <Support />
      </main>
    </Layout>
  );
}