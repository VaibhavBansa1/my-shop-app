'use client';
import { createContext, useContext } from 'react';
export const OrgContext = createContext(null);
export const useOrg = () => useContext(OrgContext);
