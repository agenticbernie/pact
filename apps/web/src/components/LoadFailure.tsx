import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";

/** Read failure with an explicit retry — the console never silently shows stale data. */
export function LoadFailure({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <Banner
      status="error"
      title={title}
      description={message}
      endContent={<Button label="Retry" size="sm" onClick={onRetry} />}
    />
  );
}
