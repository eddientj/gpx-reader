import { useEffect, useRef } from "react";
import { Linking } from "react-native";

// The app can be launched by tapping a GPX file in another app ("Open with").
// Android hands us the file as a content:// or file:// URL. Other schemes are
// ignored — notably the dev client launches the app with an exp+gpx-reader://
// URL, which is not a file to import.
const FILE_SCHEMES = ["content://", "file://"];

function isFileUrl(url: string): boolean {
  return FILE_SCHEMES.some((scheme) => url.startsWith(scheme));
}

export function useIncomingGpx(onFileUrl: (url: string) => void) {
  const handled = useRef(new Set<string>());
  const callback = useRef(onFileUrl);
  callback.current = onFileUrl;

  useEffect(() => {
    function handle(url: string | null) {
      if (!url || !isFileUrl(url) || handled.current.has(url)) return;
      handled.current.add(url);
      callback.current(url);
    }

    // Covers the app being launched cold by the file tap.
    Linking.getInitialURL().then(handle);

    // Covers the app already running when the file is tapped.
    const subscription = Linking.addEventListener("url", ({ url }) =>
      handle(url)
    );

    return () => subscription.remove();
  }, []);
}
