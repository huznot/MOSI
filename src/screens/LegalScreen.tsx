import React from 'react';
import { ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { LegalDocument } from '../components/LegalDocument';
import { PRIVACY_POLICY, TERMS_OF_USE } from '../constants/legal';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useAppTheme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Legal'>;

export function LegalScreen({ route }: Props) {
  const theme = useAppTheme();

  return (
    <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xxxl }}>
      <LegalDocument sections={route.params.doc === 'privacy' ? PRIVACY_POLICY : TERMS_OF_USE} />
    </ScrollView>
  );
}
