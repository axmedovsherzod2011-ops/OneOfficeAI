/**
 * Api
 * OneOffice AI API specification
 * OpenAPI spec version: 0.1.0
 */
import type { ProductStatus } from './productStatus';
import type { ProductCurrency } from './productCurrency';
import type { ProductCharacteristic } from './productCharacteristic';

export interface ProductItem {
  id: number;
  name: string;
  category: string;
  costPrice: string;
  sellPrice: string;
  currency: ProductCurrency;
  description: string;
  images: string[];
  status: ProductStatus;
  createdAt: string;
  /** Spec table ("Xarakteristika") shown on the storefront product page. */
  characteristics: ProductCharacteristic[];
  /** Tarkib / sostav — materials or ingredients. */
  composition: string;
  /** Foydalanish bo'yicha ko'rsatma / instruksiya. */
  instructions: string;
  /** Yetkazib berish haqida ma'lumot (dostavka muddati, hududlar, shartlar). */
  deliveryInfo: string;
}
