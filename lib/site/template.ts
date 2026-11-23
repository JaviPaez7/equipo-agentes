/**
 * The sample website every run starts from: a small static site for a
 * fictional bakery. The agents only ever touch a per-run copy of it.
 */

const header = (active: "inicio" | "productos" | "nosotros") => `  <header class="site-header">
    <div class="container header-inner">
      <a class="brand" href="index.html">
        <span class="brand-mark" aria-hidden="true">✦</span>
        Panadería La Espiga
      </a>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="main-nav">
        Menú
      </button>
      <nav id="main-nav" class="main-nav" aria-label="Principal">
        <ul>
          <li><a href="index.html"${active === "inicio" ? ' aria-current="page"' : ""}>Inicio</a></li>
          <li><a href="productos.html"${active === "productos" ? ' aria-current="page"' : ""}>Productos</a></li>
          <li><a href="nosotros.html"${active === "nosotros" ? ' aria-current="page"' : ""}>Nosotros</a></li>
        </ul>
      </nav>
    </div>
  </header>`;

const footer = `  <footer class="site-footer">
    <div class="container footer-inner">
      <p>© 2026 Panadería La Espiga · Calle Mayor 12, Las Palmas de Gran Canaria</p>
      <p>Abierto de lunes a sábado, de 7:00 a 20:30</p>
    </div>
  </footer>
  <script src="main.js"></script>`;

const page = (title: string, description: string, active: "inicio" | "productos" | "nosotros", main: string) =>
  `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${description}">
  <title>${title}</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
${header(active)}
  <main>
${main}
  </main>
${footer}
</body>
</html>
`;

const index = page(
  "Panadería La Espiga · Pan de masa madre en Las Palmas",
  "Panadería artesana de barrio: pan de masa madre, bollería y café recién hecho.",
  "inicio",
  `    <section class="hero">
      <div class="container hero-inner">
        <p class="eyebrow">Desde 1987 en el barrio</p>
        <h1>Pan de masa madre, horneado cada mañana</h1>
        <p class="lead">Harinas de molino, fermentaciones largas y nada de prisas. Ven a por tu barra antes de que se acabe.</p>
        <a class="button" href="productos.html">Ver productos</a>
      </div>
    </section>
    <section class="container features" aria-labelledby="why-title">
      <h2 id="why-title">Por qué nos eligen</h2>
      <div class="grid">
        <article class="card">
          <h3>Masa madre propia</h3>
          <p>Nuestra masa madre tiene más de treinta años y la alimentamos a diario.</p>
        </article>
        <article class="card">
          <h3>Ingredientes locales</h3>
          <p>Trabajamos con harinas y productos de agricultores de Gran Canaria.</p>
        </article>
        <article class="card">
          <h3>Horno de leña</h3>
          <p>Cocemos en horno de leña para conseguir una corteza crujiente.</p>
        </article>
      </div>
    </section>`,
);

const productos = page(
  "Productos · Panadería La Espiga",
  "Panes, bollería y dulces de Panadería La Espiga.",
  "productos",
  `    <section class="container page-intro">
      <h1>Nuestros productos</h1>
      <p class="lead">Elaboramos cada día una selección corta para que todo salga fresco.</p>
    </section>
    <section class="container" aria-labelledby="bread-title">
      <h2 id="bread-title">Panes</h2>
      <ul class="product-list">
        <li class="product">
          <h3>Hogaza de centeno</h3>
          <p>Centeno integral con fermentación de 24 horas.</p>
          <p class="price">4,20 €</p>
        </li>
        <li class="product">
          <h3>Barra rústica</h3>
          <p>Corteza crujiente y miga alveolada.</p>
          <p class="price">1,60 €</p>
        </li>
        <li class="product">
          <h3>Pan de millo</h3>
          <p>Receta canaria con harina de maíz tostado.</p>
          <p class="price">2,90 €</p>
        </li>
      </ul>
    </section>
    <section class="container" aria-labelledby="sweet-title">
      <h2 id="sweet-title">Bollería</h2>
      <ul class="product-list">
        <li class="product">
          <h3>Croissant de mantequilla</h3>
          <p>Laminado a mano durante tres días.</p>
          <p class="price">1,80 €</p>
        </li>
        <li class="product">
          <h3>Bizcocho de naranja</h3>
          <p>Con naranjas de Telde.</p>
          <p class="price">9,50 €</p>
        </li>
      </ul>
    </section>`,
);

const nosotros = page(
  "Nosotros · Panadería La Espiga",
  "La historia de Panadería La Espiga y del equipo que la hace posible.",
  "nosotros",
  `    <section class="container page-intro">
      <h1>Nosotros</h1>
      <p class="lead">Somos una panadería familiar que lleva casi cuarenta años abriendo antes que el sol.</p>
    </section>
    <section class="container prose" aria-labelledby="story-title">
      <h2 id="story-title">Nuestra historia</h2>
      <p>Carmen y Luis abrieron La Espiga en 1987 con un horno de leña y una receta de pan de millo heredada de la abuela. Hoy la lleva su hija Marta, que ha recuperado la masa madre y las fermentaciones largas.</p>
      <h2>Cómo trabajamos</h2>
      <p>Horneamos en pequeñas tandas a lo largo del día. Lo que no se vende lo donamos cada noche al comedor social del barrio.</p>
    </section>`,
);

const styles = `:root {
  --color-bg: #fffaf3;
  --color-surface: #ffffff;
  --color-text: #2b2118;
  --color-muted: #6b5b4d;
  --color-accent: #b45309;
  --color-accent-dark: #8a3f06;
  --color-border: #eadfce;
  --radius: 12px;
  --shadow: 0 6px 24px rgba(43, 33, 24, 0.08);
  --font-body: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-display: Georgia, "Times New Roman", serif;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: var(--font-body);
  line-height: 1.6;
  color: var(--color-text);
  background: var(--color-bg);
}

.container {
  width: min(1100px, 100% - 2rem);
  margin-inline: auto;
}

h1, h2, h3 {
  font-family: var(--font-display);
  line-height: 1.2;
}

a { color: var(--color-accent); }

.site-header {
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 10;
}

.header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-block: 1rem;
}

.brand {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.2rem;
  color: var(--color-text);
  text-decoration: none;
}

.brand-mark { color: var(--color-accent); margin-right: 0.35rem; }

.main-nav ul {
  display: flex;
  gap: 1.5rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.main-nav a {
  color: var(--color-muted);
  text-decoration: none;
  font-weight: 600;
}

.main-nav a:hover,
.main-nav a[aria-current="page"] { color: var(--color-accent); }

.nav-toggle {
  display: none;
  border: 1px solid var(--color-border);
  background: transparent;
  border-radius: var(--radius);
  padding: 0.4rem 0.8rem;
  font: inherit;
}

.hero {
  background: linear-gradient(135deg, #fde7c8, #fff6ea);
  padding-block: 5rem;
}

.hero h1 { font-size: clamp(2rem, 5vw, 3.2rem); max-width: 16ch; margin: 0.25rem 0 1rem; }

.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-accent);
  margin: 0;
}

.lead { font-size: 1.15rem; color: var(--color-muted); max-width: 60ch; }

.button {
  display: inline-block;
  margin-top: 1rem;
  padding: 0.8rem 1.4rem;
  border-radius: 999px;
  background: var(--color-accent);
  color: #fff;
  text-decoration: none;
  font-weight: 700;
}

.button:hover { background: var(--color-accent-dark); }

.features, .page-intro { padding-block: 3rem 1rem; }

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1.25rem;
}

.card, .product {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 1.5rem;
  box-shadow: var(--shadow);
}

.card h3, .product h3 { margin-top: 0; }

.product-list {
  list-style: none;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.25rem;
}

.price { font-weight: 700; color: var(--color-accent-dark); margin-bottom: 0; }

.prose { max-width: 70ch; padding-bottom: 3rem; }

.site-footer {
  margin-top: 4rem;
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-muted);
  font-size: 0.95rem;
}

.footer-inner { padding-block: 1.5rem; }

.footer-inner p { margin: 0.25rem 0; }

@media (max-width: 720px) {
  .nav-toggle { display: inline-block; }
  .main-nav { display: none; width: 100%; }
  .main-nav.is-open { display: block; }
  .main-nav ul { flex-direction: column; gap: 0.75rem; padding-top: 0.75rem; }
  .header-inner { flex-wrap: wrap; }
}
`;

const mainJs = `// Opens and closes the navigation menu on small screens.
const toggle = document.querySelector(".nav-toggle");
const nav = document.getElementById("main-nav");

if (toggle && nav) {
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
  });
}
`;

export const SITE_TEMPLATE: Readonly<Record<string, string>> = Object.freeze({
  "index.html": index,
  "productos.html": productos,
  "nosotros.html": nosotros,
  "styles.css": styles,
  "main.js": mainJs,
});

export const SITE_NAME = "Panadería La Espiga";
