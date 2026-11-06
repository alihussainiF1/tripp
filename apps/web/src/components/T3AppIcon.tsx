// The tripp app icon, served from the web public folder so the PWA and the app share one file.
export function T3AppIcon(props: { readonly className?: string }) {
  return <img src="/apple-touch-icon.png" alt="" className={props.className} />;
}
