import React, { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';

import { ONBOARDING_SLIDES } from '../constants/config';
import { useAppTheme } from '../theme';

type Props = {
  onDone: () => void;
};

export function OnboardingFlow({ onDone }: Props) {
  const theme = useAppTheme();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const goTo = (nextIndex: number) => {
    setIndex(nextIndex);
    scrollRef.current?.scrollTo({ x: nextIndex * width, animated: true });
  };

  return (
    <Modal animationType="fade" transparent>
      <View
        style={{
          flex: 1,
          backgroundColor: theme.isDark ? '#0A1210' : '#EAF2ED',
          paddingTop: 72,
          paddingBottom: 32,
        }}
      >
        <View
          style={{
            paddingHorizontal: theme.spacing.md,
            flexDirection: 'row',
            justifyContent: 'flex-end',
          }}
        >
          <Pressable onPress={onDone}>
            <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>Skip</Text>
          </Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          style={{ flex: 1 }}
        >
          {ONBOARDING_SLIDES.map((slide) => (
            <View
              key={slide.id}
              style={{
                width,
                paddingHorizontal: theme.spacing.xl,
                justifyContent: 'center',
                gap: theme.spacing.lg,
              }}
            >
              <View
                style={{
                  alignSelf: 'center',
                  width: 140,
                  height: 140,
                  borderRadius: 36,
                  backgroundColor: theme.colors.card,
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: theme.shadows.card,
                }}
              >
                <Text style={{ fontSize: 64 }}>{slide.emoji}</Text>
              </View>
              <Text
                style={{
                  ...theme.typography.display,
                  color: theme.colors.text,
                  textAlign: 'center',
                }}
              >
                {slide.title}
              </Text>
              <Text
                style={{
                  ...theme.typography.body,
                  color: theme.colors.textMuted,
                  textAlign: 'center',
                }}
              >
                {slide.description}
              </Text>
            </View>
          ))}
        </ScrollView>

        <View
          style={{
            paddingHorizontal: theme.spacing.xl,
            gap: theme.spacing.lg,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: theme.spacing.sm }}>
            {ONBOARDING_SLIDES.map((slide, slideIndex) => (
              <View
                key={slide.id}
                style={{
                  width: slideIndex === index ? 22 : 8,
                  height: 8,
                  borderRadius: 999,
                  backgroundColor: slideIndex === index ? theme.colors.primary : theme.colors.divider,
                }}
              />
            ))}
          </View>

          <Pressable
            onPress={() => {
              if (index === ONBOARDING_SLIDES.length - 1) {
                onDone();
                return;
              }

              goTo(index + 1);
            }}
            style={{
              borderRadius: theme.radii.lg,
              paddingVertical: 16,
              backgroundColor: theme.colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ ...theme.typography.title, color: theme.colors.textOnPrimary }}>
              {index === ONBOARDING_SLIDES.length - 1 ? 'Open MOSI' : 'Continue'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
