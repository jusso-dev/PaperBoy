import { Send } from "lucide-react";

export function ExpressMailSticker() {
  return (
    <div aria-hidden="true" className="express-mail-sticker">
      <span>
        <strong>PAPERBOY</strong>
        <small>EXPRESS MAIL</small>
      </span>
      <Send strokeWidth={1.5} />
    </div>
  );
}
