// Required by Next.js. The dashboard itself is the static file public/index.html (served at "/").
export default function RootLayout({ children }) {
  return (<html lang="en"><body>{children}</body></html>);
}
