"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * In-memory basket for the seller-entered-order flow - deliberately NOT the
 * buyer's localStorage cart (src/lib/cart/): a seller might create several
 * orders for different customers back to back, and each one starts fresh
 * with this page. Holds only { productUnitId, quantity } - the same
 * "nothing sensitive to protect" property as the buyer cart, and for the
 * same reason: resolveSellerOrderLinesAction/createSellerOrderAction both
 * re-resolve price/availability from the database, never trusting this.
 */
export type SellerBasketItem = { productUnitId: string; quantity: number };

type SellerBasketContextValue = {
  items: SellerBasketItem[];
  addItem: (productUnitId: string, quantity: number) => void;
  setQuantity: (productUnitId: string, quantity: number) => void;
  removeItem: (productUnitId: string) => void;
};

const SellerBasketContext = createContext<SellerBasketContextValue | null>(null);

export function SellerBasketProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<SellerBasketItem[]>([]);

  const addItem = (productUnitId: string, quantity: number) => {
    setItems((prev) => {
      const existing = prev.find((item) => item.productUnitId === productUnitId);
      if (existing) {
        return prev.map((item) =>
          item.productUnitId === productUnitId ? { ...item, quantity: item.quantity + quantity } : item
        );
      }
      return [...prev, { productUnitId, quantity }];
    });
  };

  const setQuantity = (productUnitId: string, quantity: number) => {
    setItems((prev) => {
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return prev.filter((item) => item.productUnitId !== productUnitId);
      }
      return prev.map((item) => (item.productUnitId === productUnitId ? { ...item, quantity } : item));
    });
  };

  const removeItem = (productUnitId: string) => {
    setItems((prev) => prev.filter((item) => item.productUnitId !== productUnitId));
  };

  return (
    <SellerBasketContext.Provider value={{ items, addItem, setQuantity, removeItem }}>
      {children}
    </SellerBasketContext.Provider>
  );
}

export function useSellerBasket(): SellerBasketContextValue {
  const context = useContext(SellerBasketContext);
  if (!context) {
    throw new Error("useSellerBasket must be used within a SellerBasketProvider");
  }
  return context;
}
