export { InitSchema1785000000000 } from './1785000000000-InitSchema';
export { CreateGuidePages1785000001000 } from './1785000001000-CreateGuidePages';
export { AddConcurrencyConstraints1785000002000 } from './1785000002000-AddConcurrencyConstraints';
export { AddTemplateConstraints1785000003000 } from './1785000003000-AddTemplateConstraints';

import { InitSchema1785000000000 } from './1785000000000-InitSchema';
import { CreateGuidePages1785000001000 } from './1785000001000-CreateGuidePages';
import { AddConcurrencyConstraints1785000002000 } from './1785000002000-AddConcurrencyConstraints';
import { AddTemplateConstraints1785000003000 } from './1785000003000-AddTemplateConstraints';

export const migrations = [
  InitSchema1785000000000,
  CreateGuidePages1785000001000,
  AddConcurrencyConstraints1785000002000,
  AddTemplateConstraints1785000003000,
];
