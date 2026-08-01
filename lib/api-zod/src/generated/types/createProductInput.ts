/**
 * Api
 * OneOffice AI API specification
 * OpenAPI spec version: 0.1.0
 */
import type { ProductStatus } from './productStatus';
import type { ProductCurrency } from './productCurrency';

export interface CreateProductInput {
  name?: string;
  category?: string;
  costPrice?: string;
  sellPrice?: string;
  currency?: ProductCurrency;
  description?: string;
  images?: string[];
  status?: ProductStatus;
}
