/** Tailwind CSS v4 runs through PostCSS. Without this, Next emits the
 *  preflight/theme layers but generates no utility classes at all. */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
