import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ThemeChoiceContext, type ThemeChoice } from '@/theme';

const KEY = 'tourny-theme';
const SetChoice = createContext<(c: ThemeChoice) => void>(() => {});

/** Light, dark or follow the phone, remembered like the web theme toggle. */
export function ThemeChoiceProvider({ children }: { children: ReactNode }) {
  const [choice, setChoice] = useState<ThemeChoice>('system');
  useEffect(() => {
    AsyncStorage.getItem(KEY).then((saved) => { if (saved === 'light' || saved === 'dark') setChoice(saved); }).catch(() => {});
  }, []);
  const update = (next: ThemeChoice) => { setChoice(next); AsyncStorage.setItem(KEY, next).catch(() => {}); };
  return (
    <ThemeChoiceContext.Provider value={choice}>
      <SetChoice.Provider value={update}>{children}</SetChoice.Provider>
    </ThemeChoiceContext.Provider>
  );
}

export const useSetThemeChoice = () => useContext(SetChoice);
