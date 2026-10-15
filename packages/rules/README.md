# @currents/rules

Matches tests against [Currents actions](https://docs.currents.dev/guides/currents-actions): skip, quarantine and tag.

The Currents reporters fetch the actions of a project and use this package to find the actions that match each test. Each reporter then applies the matched actions in its own way.

```ts
import { RulesEvalBase } from '@currents/rules';

const rules = new RulesEvalBase(actions);
const matched = rules.getMatchedRulesGroupedByType({
  title: 'logs in',
  titlePath: ['login.spec.ts', 'auth', 'logs in'],
  file: 'login.spec.ts',
  project: 'chromium',
  testId: 'abc123',
  tag: ['@smoke'],
  errors: [{ message: 'Timed out' }],
});
// { quarantine: [...], tag: [...] }
```
