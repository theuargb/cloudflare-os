# Database schema fragments

Submit one `<schema summary="…">` fragment through the Schema resource. Names are lowercase
business identifiers. Omitted tables, columns, indexes, and constraints are unchanged.

## Create a table

```xml
<schema summary="Add customers">
  <table name="customers">
    <column name="id" type="integer" nullable="false" autoincrement="true"/>
    <column name="email" type="text" nullable="false"/>
    <column name="enabled" type="boolean" default="1"/>
    <column name="status" type="text" default="draft"/>
    <constraint name="customers_pk" type="primary" columns="id"/>
    <constraint name="customers_email_unique" type="unique" columns="email"/>
    <constraint name="customers_status_enum" type="enum" columns="status" values="draft,active,disabled"/>
    <index name="customers_enabled" columns="enabled"/>
    <index name="customers_email_lookup" columns="email" unique="true"/>
  </table>
</schema>
```

## Extend a table and use every scalar type

```xml
<schema summary="Store customer details">
  <table name="customers">
    <column name="score" type="real"/>
    <column name="birthday" type="date"/>
    <column name="last_seen" type="datetime"/>
    <column name="credit" type="decimal" default="0"/>
    <column name="preferences" type="json"/>
    <column name="avatar" type="binary"/>
    <constraint name="customers_score_bound" type="check" columns="score" operator="gte" value="0"/>
  </table>
</schema>
```

## Foreign key, rename, and conversion

```xml
<schema summary="Add orders and rename email">
  <table name="orders">
    <column name="id" type="integer" nullable="false"/>
    <column name="customer_id" type="integer" nullable="false"/>
    <column name="referrer_id" type="integer"/>
    <constraint name="orders_pk" type="primary" columns="id"/>
    <constraint name="orders_customer_fk" type="foreign-key" columns="customer_id" ref-table="customers" ref-columns="id" on-delete="cascade"/>
    <constraint name="orders_referrer_fk" type="foreign-key" columns="referrer_id" ref-table="customers" ref-columns="id" on-delete="restrict"/>
  </table>
  <table name="customers">
    <column name="email_address" type="text" rename-from="email" conversion="identity"/>
  </table>
</schema>
```

## Retire objects

```xml
<schema summary="Retire obsolete avatar">
  <table name="customers">
    <column name="avatar" type="binary" disabled="true"/>
    <index name="customers_enabled" columns="enabled" disabled="true"/>
  </table>
  <table name="legacy_imports" disabled="true"/>
</schema>
```
