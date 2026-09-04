import { h, Section, type ConfiguratorUISpec } from "@gadgets/configurator-ui";

export default {
  initial: {},
  isReady: () => true,
  resourceUrl: () => "database://installation/data",
  render: () => (
    <Section>
      Connect the Database data resource to run authorized SQLite reads and writes against the
      installation database.
    </Section>
  ),
} satisfies ConfiguratorUISpec<never, Record<string, never>>;
