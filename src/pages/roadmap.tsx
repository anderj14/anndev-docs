import React, { JSX } from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import styles from './roadmap.module.css';

interface Card {
  title: string;
  sub: string;
  doc: string | null;
  soon?: boolean;
  fullWidth?: boolean;
}

interface Phase {
  tag: string;
  color: 'teal' | 'blue' | 'coral' | 'amber';
  cards: Card[];
}

const RESOURCES = [
  {
    title: 'Lucas Moy — C# para principiantes',
    sub: 'Español · App real con Windows Forms y SQL',
    url: 'https://www.youtube.com/@LucasMoy',
  },
  {
    title: 'dotnet — C# for Beginners',
    sub: 'David Fowler y Scott Hanselman · Oficial Microsoft',
    url: 'https://www.youtube.com/@dotnet',
  },
  {
    title: 'Bro Code — C# Tutorial',
    sub: 'Inglés · Directo y condensado',
    url: 'https://www.youtube.com/@BroCodez',
  },
];

const PHASES: Phase[] = [
  {
    tag: 'Fase 1 — Fundamentos de Web API',
    color: 'teal',
    cards: [
      { title: 'Cómo funciona una Web API', sub: 'Pipeline, request → response, middleware', doc: '/docs/dotnet/Fundamentos/como-funciona-web-api' },
      { title: 'Controllers y rutas', sub: 'HTTP verbs, endpoints, parámetros', doc: '/docs/dotnet/Fundamentos/controllers-rutas' },
      { title: 'Middleware', sub: 'Pipeline, orden, custom middleware', doc: '/docs/dotnet/Fundamentos/middleware' },
      { title: 'DTOs y AutoMapper', sub: 'Separar entidades del contrato API', doc: '/docs/dotnet/Fundamentos/dtos-mappers' },
      { title: 'Manejo de errores', sub: 'ApiResponse, middleware de excepciones', doc: '/docs/dotnet/Fundamentos/errores' },
    ],
  },
  {
    tag: 'Fase 2 — Patrones base',
    color: 'teal',
    cards: [
      { title: 'Inyección de dependencias', sub: 'DI nativa, lifetimes, IServiceCollection', doc: '/docs/dotnet/Patrones/di' },
      { title: 'Patrón Repository', sub: 'Simple → genérico → interfaz', doc: '/docs/dotnet/Patrones/repository' },
      { title: 'Unit of Work', sub: 'Transacciones, múltiples repos', doc: '/docs/dotnet/Patrones/unit-of-work' },
      { title: 'Specification Pattern', sub: 'Queries reutilizables, paginación', doc: '/docs/dotnet/Patrones/specification' },
      { title: 'Entity Framework Core', sub: 'DbContext, migraciones, relaciones', doc: '/docs/dotnet/Patrones/ef-core' },
    ],
  },
  {
    tag: 'Proyecto Integrador (Fases 1 y 2)',
    color: 'teal',
    cards: [
      { title: 'MediFlow API', sub: 'Sistema de citas: CRUD, Reglas de negocio y Patrones', doc: '/docs/proyectos/mediflow-complete-guide', fullWidth: true },
    ],
  },
  {
    tag: 'Fase 3 — Patrones intermedios',
    color: 'blue',
    cards: [
      { title: 'Strategy Pattern', sub: 'Reglas de negocio intercambiables', doc: '/docs/dotnet/PatronesIntermedios/strategy' },
      { title: 'Decorator Pattern', sub: 'Logging, caché, middlewares', doc: '/docs/dotnet/PatronesIntermedios/decorator' },
      { title: 'CQRS + MediatR', sub: 'Separar lecturas de escrituras', doc: null, soon: true },
      { title: 'Result Pattern', sub: 'Errores sin exceptions', doc: null, soon: true },
      { title: 'JWT + Identity', sub: 'Auth, roles, policies, claims', doc: '/docs/dotnet/PatronesIntermedios/jwt' },
      { title: 'FluentValidation', sub: 'Validaciones limpias y testeables', doc: null, soon: true },
    ],
  },
  {
    tag: 'Fase 4 — Patrones bajo presión',
    color: 'coral',
    cards: [
      { title: 'DB legacy sin FK', sub: 'Joins manuales, repos específicos', doc: null, soon: true },
      { title: 'Entidades en plano', sub: 'Agrupar, ToLookup, paginación', doc: null, soon: true },
      { title: 'Campos que mienten', sub: 'Flags, nombres incorrectos, pragmatismo', doc: null, soon: true },
    ],
  },
  {
    tag: 'Fase 5 — Arquitectura avanzada',
    color: 'amber',
    cards: [
      { title: 'Monolito modular', sub: 'Módulos, contratos, sin microservicios', doc: null, soon: true },
      { title: 'Multi-tenancy', sub: 'Shared DB, filtros globales, tenant ID', doc: null, soon: true },
      { title: 'Outbox Pattern', sub: 'Mensajes garantizados, consistencia', doc: null, soon: true },
      { title: 'Background jobs', sub: 'Quartz, Hosted Services, tareas', doc: null, soon: true },
      { title: 'Options Pattern', sub: 'Config por ambiente, secrets', doc: null, soon: true },
      { title: 'Clean Architecture', sub: 'Capas, contratos, independencia', doc: null, soon: true },
    ],
  },
];

const COMING = [
  { title: 'Python + FastAPI', sub: 'Arquitectura aplicada en Python' },
  { title: 'Machine Learning', sub: 'Regresión, clasificación, ensemble + ingeniería de software' },
  { title: 'SQL avanzado', sub: 'Diseño, queries, optimización' },
];

function ArrowDown() {
  return (
    <div className={styles.arrowDown}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 5v14M5 12l7 7 7-7" />
      </svg>
    </div>
  );
}

export default function Roadmap(): JSX.Element {
  return (
    <Layout title="Roadmap" description="Ruta de aprendizaje completa — de cero a SaaS con .NET">
      <main className={styles.main}>

        <div className={styles.hero}>
          <p className={styles.sectionLabel}>Roadmap</p>
          <h1 className={styles.title}>De cero a SaaS con .NET</h1>
          <p className={styles.sub}>
            Puedes entrar en cualquier fase según tu nivel. Si ya conoces C# y Web APIs, ve directo a la Fase 2.
          </p>
        </div>

        <div className={styles.legend}>
          <div className={styles.leg}><span className={`${styles.legDot} ${styles.tealDot}`} />Fundamentos</div>
          <div className={styles.leg}><span className={`${styles.legDot} ${styles.blueDot}`} />Intermedio</div>
          <div className={styles.leg}><span className={`${styles.legDot} ${styles.coralDot}`} />Casos reales</div>
          <div className={styles.leg}><span className={`${styles.legDot} ${styles.amberDot}`} />Avanzado</div>
          <div className={styles.leg}><span className={`${styles.legDot} ${styles.grayDot}`} />Próximamente</div>
        </div>

        {/* Prerrequisitos */}
        <div className={styles.phase}>
          <div className={styles.phaseHeader}>
            <span className={`${styles.phaseTag} ${styles.tagGray}`}>Antes de empezar — C#</span>
            <div className={styles.phaseLine} />
          </div>
          <p className={styles.note}>
            Si no conoces C#, te recomendamos estos recursos antes de continuar. Esta documentación asume conocimiento básico del lenguaje.
          </p>
          <div className={`${styles.cardsRow} ${styles.cols3}`}>
            {RESOURCES.map((r) => (
              <a key={r.title} className={styles.card} href={r.url} target="_blank" rel="noreferrer">
                <div className={styles.cardTitle}>{r.title}</div>
                <div className={styles.cardSub}>{r.sub}</div>
              </a>
            ))}
          </div>
        </div>

        <ArrowDown />

        {/* Fases */}
        {PHASES.map((phase, i) => (
          <React.Fragment key={phase.tag}>
            <div className={styles.phase}>
              <div className={styles.phaseHeader}>
                <span className={`${styles.phaseTag} ${styles[`tag-${phase.color}`]}`}>{phase.tag}</span>
                <div className={styles.phaseLine} />
              </div>
              <div className={`${styles.cardsRow} ${phase.cards.some(c => c.fullWidth) ? styles.cols1 : (phase.cards.length <= 3 ? styles.cols3 : styles.cols3)}`}>
                {phase.cards.map((card) =>
                  card.soon ? (
                    <div key={card.title} className={`${styles.card} ${styles.cardGray}`}>
                      <div className={styles.cardTitle}>{card.title}</div>
                      <div className={styles.cardSub}>{card.sub}</div>
                      <span className={styles.badgeSoon}>Próximamente</span>
                    </div>
                  ) : (
                    <Link key={card.title} className={`${styles.card} ${styles[`card-${phase.color}`]}`} to={card.doc || '#'}>
                      <div className={styles.cardTitle}>{card.title}</div>
                      <div className={styles.cardSub}>{card.sub}</div>
                    </Link>
                  )
                )}
              </div>
            </div>
            {i < PHASES.length - 1 && <ArrowDown />}
          </React.Fragment>
        ))}

        <ArrowDown />

        {/* Próximamente */}
        <div className={styles.phase}>
          <div className={styles.phaseHeader}>
            <span className={`${styles.phaseTag} ${styles.tagComing}`}>Próximamente en Anndev Docs</span>
            <div className={styles.phaseLine} />
          </div>
          <div className={`${styles.cardsRow} ${styles.cols3}`}>
            {COMING.map((c) => (
              <div key={c.title} className={styles.comingCard}>
                <div className={styles.comingTitle}>{c.title}</div>
                <div className={styles.comingSub}>{c.sub}</div>
              </div>
            ))}
          </div>
        </div>

      </main>
    </Layout>
  );
}