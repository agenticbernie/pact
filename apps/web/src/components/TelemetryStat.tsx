import { Card } from "@astryxdesign/core/Card";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

/**
 * One telemetry figure from the read model.
 *
 * The number is the loudest thing in the tile and is set in the theme's code
 * face with tabular figures, so a column of these never shifts as values
 * change. The caption states what the figure is scoped to — a cap, a verified
 * credit or a settled total — because the same number means different things
 * at different scopes.
 */
export function TelemetryStat({
  label,
  value,
  unit,
  note,
}: {
  /** Micro-label, already uppercased by the caller. */
  label: string;
  value: string;
  unit?: string;
  note?: string;
}) {
  return (
    <Card>
      <VStack gap={1}>
        <Text type="label" size="xsm" color="secondary">
          {label}
        </Text>
        <Stack direction="horizontal" gap={1} align="end">
          <Text type="code" size="3xl" weight="semibold" hasTabularNumbers>
            {value}
          </Text>
          {unit === undefined ? null : <Text type="supporting">{unit}</Text>}
        </Stack>
        {note === undefined ? null : <Text type="supporting">{note}</Text>}
      </VStack>
    </Card>
  );
}
