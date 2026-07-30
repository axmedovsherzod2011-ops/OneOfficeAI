/**
 * Api
 * OneOffice AI API specification
 * OpenAPI spec version: 0.1.0
 */
import type { ProductStatus } from './productStatus';

export interface UpdateProductInput {
  name?: string;
  category?: string;
  costPrice?: string;
  sellPrice?: string;
  description?: string;
  images?: string[];
  status?: ProductStatus;
}
