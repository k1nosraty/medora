import { useLayoutEffect, useState } from "react";
import { paintFeature } from "../renderer";

function FamilyNotice({
  host,
  message,
  lifetime,
}: {
  host: HTMLElement;
  message: string;
  lifetime?: number | undefined;
}) {
  const [visible, setVisible] = useState(Boolean(message));
  useLayoutEffect(() => {
    host.hidden = !visible;
    if (!visible || !lifetime) return;
    const timer = setTimeout(() => setVisible(false), lifetime);
    return () => clearTimeout(timer);
  }, [host, visible, lifetime]);
  return message;
}

let revision = 0;
export function showFamilyNotice(message: string, lifetime?: number) {
  const host = document.getElementById("family-notice")!;
  paintFeature(
    host,
    <FamilyNotice
      key={++revision}
      host={host}
      message={message}
      lifetime={lifetime}
    />,
  );
}
