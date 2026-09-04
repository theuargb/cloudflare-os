import { h, Section, type ConfiguratorUISpec } from "@gadgets/configurator-ui";

export default {
  initial: {},
  isReady: () => true,
  resourceUrl: () => "database://installation/schema",
  render: () => (
    <Section>
      Connect the Database schema resource to inspect the active XML and submit schema proposals
      for deployment-admin review.
    </Section>
  ),
} satisfies ConfiguratorUISpec<never, Record<string, never>>;
