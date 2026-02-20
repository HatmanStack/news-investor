/**
 * Toast Notification System
 *
 * Glass morphism toast notifications with multiple themes
 * Inspired by matt-cannon's "Toast Notification Playground" CodePen
 *
 * Supports: info, success, warning, error variants
 * Features: auto-dismiss, swipe-to-dismiss, stacking
 */

import React, { createContext, useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/hooks/useAppTheme';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  SlideInUp,
  SlideOutUp,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

// Toast types
export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface ToastConfig {
  id: string;
  message: string;
  variant: ToastVariant;
  duration?: number; // ms, 0 = persistent
  title?: string;
  action?: {
    label: string;
    onPress: () => void;
  };
}

interface ToastContextType {
  show: (config: Omit<ToastConfig, 'id'>) => string;
  hide: (id: string) => void;
  hideAll: () => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast(): ToastContextType {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

// Individual toast component
interface ToastItemProps {
  config: ToastConfig;
  onDismiss: () => void;
}

function ToastItem({ config, onDismiss }: ToastItemProps) {
  const theme = useAppTheme();
  const translateX = useSharedValue(0);

  // Auto-dismiss timer
  useEffect(() => {
    if (config.duration && config.duration > 0) {
      const timer = setTimeout(onDismiss, config.duration);
      return () => clearTimeout(timer);
    }
  }, [config.duration, onDismiss]);

  // Swipe to dismiss gesture
  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > 100) {
        translateX.value = withTiming(e.translationX > 0 ? 400 : -400, { duration: 200 });
        runOnJS(onDismiss)();
      } else {
        translateX.value = withSpring(0);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Variant-specific styling
  const variantStyles = getVariantStyles(theme, config.variant);
  const IconComponent = getVariantIcon(config.variant);

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        entering={SlideInUp.springify().damping(15)}
        exiting={SlideOutUp.springify().damping(15)}
        style={[styles.toastContainer, animatedStyle]}
      >
        <View style={[styles.toast, variantStyles.container]}>
          {/* Glass effect overlay */}
          <View style={[styles.glassOverlay, variantStyles.glass]} />

          {/* Content */}
          <View style={styles.toastContent}>
            {/* Icon */}
            <View style={[styles.iconContainer, variantStyles.iconBg]}>
              <Ionicons name={IconComponent} size={20} color={variantStyles.iconColor} />
            </View>

            {/* Text */}
            <View style={styles.textContainer}>
              {config.title && (
                <Text style={[styles.title, { color: variantStyles.textColor }]}>
                  {config.title}
                </Text>
              )}
              <Text style={[styles.message, { color: variantStyles.textColor }]} numberOfLines={2}>
                {config.message}
              </Text>
            </View>

            {/* Action button */}
            {config.action && (
              <Pressable
                onPress={() => {
                  config.action?.onPress();
                  onDismiss();
                }}
                style={styles.actionButton}
              >
                <Text style={[styles.actionText, { color: variantStyles.accentColor }]}>
                  {config.action.label}
                </Text>
              </Pressable>
            )}

            {/* Close button */}
            <Pressable onPress={onDismiss} style={styles.closeButton}>
              <Ionicons name="close" size={18} color={variantStyles.textColor} />
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

// Variant styling helper
function getVariantStyles(theme: ReturnType<typeof useAppTheme>, variant: ToastVariant) {
  const base = {
    textColor: '#FFFFFF',
    accentColor: theme.colors.primary,
  };

  switch (variant) {
    case 'success':
      return {
        ...base,
        container: {
          borderColor: 'rgba(76, 175, 80, 0.4)',
        },
        glass: {
          backgroundColor: 'rgba(76, 175, 80, 0.15)',
        },
        iconBg: {
          backgroundColor: 'rgba(76, 175, 80, 0.25)',
        },
        iconColor: '#4CAF50',
        accentColor: '#81C784',
      };
    case 'warning':
      return {
        ...base,
        container: {
          borderColor: 'rgba(255, 152, 0, 0.4)',
        },
        glass: {
          backgroundColor: 'rgba(255, 152, 0, 0.15)',
        },
        iconBg: {
          backgroundColor: 'rgba(255, 152, 0, 0.25)',
        },
        iconColor: '#FF9800',
        accentColor: '#FFB74D',
      };
    case 'error':
      return {
        ...base,
        container: {
          borderColor: 'rgba(244, 67, 54, 0.4)',
        },
        glass: {
          backgroundColor: 'rgba(244, 67, 54, 0.15)',
        },
        iconBg: {
          backgroundColor: 'rgba(244, 67, 54, 0.25)',
        },
        iconColor: '#F44336',
        accentColor: '#E57373',
      };
    case 'info':
    default:
      return {
        ...base,
        container: {
          borderColor: 'rgba(33, 150, 243, 0.4)',
        },
        glass: {
          backgroundColor: 'rgba(33, 150, 243, 0.15)',
        },
        iconBg: {
          backgroundColor: 'rgba(33, 150, 243, 0.25)',
        },
        iconColor: '#2196F3',
        accentColor: '#64B5F6',
      };
  }
}

// Icon helper
function getVariantIcon(variant: ToastVariant): keyof typeof Ionicons.glyphMap {
  switch (variant) {
    case 'success':
      return 'checkmark-circle';
    case 'warning':
      return 'warning';
    case 'error':
      return 'alert-circle';
    case 'info':
    default:
      return 'information-circle';
  }
}

// Provider component
interface ToastProviderProps {
  children: React.ReactNode;
  maxToasts?: number;
}

export function ToastProvider({ children, maxToasts = 3 }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastConfig[]>([]);
  const idCounter = useRef(0);

  const show = useCallback(
    (config: Omit<ToastConfig, 'id'>) => {
      const id = `toast-${++idCounter.current}`;
      const newToast: ToastConfig = {
        ...config,
        id,
        duration: config.duration ?? 4000, // Default 4 seconds
      };

      setToasts((prev) => {
        const updated = [newToast, ...prev];
        // Limit max visible toasts
        return updated.slice(0, maxToasts);
      });

      return id;
    },
    [maxToasts],
  );

  const hide = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const hideAll = useCallback(() => {
    setToasts([]);
  }, []);

  const contextValue = useMemo(() => ({ show, hide, hideAll }), [show, hide, hideAll]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {/* Toast container - renders at top of screen */}
      <View style={styles.toastStack} pointerEvents="box-none">
        {toasts.map((toast, index) => (
          <Animated.View
            key={toast.id}
            entering={FadeIn.delay(index * 50)}
            exiting={FadeOut}
            style={{ zIndex: toasts.length - index }}
          >
            <ToastItem config={toast} onDismiss={() => hide(toast.id)} />
          </Animated.View>
        ))}
      </View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  toastStack: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 20 : 60,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
    pointerEvents: 'box-none',
  },
  toastContainer: {
    marginBottom: 8,
    maxWidth: 400,
    width: '90%',
  },
  toast: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
      web: {
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.4)',
      } as unknown as object,
    }),
  },
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      } as unknown as object,
      default: {
        // Fallback solid background for native
        backgroundColor: 'rgba(30, 30, 30, 0.95)',
      },
    }),
  },
  toastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  message: {
    fontSize: 13,
    opacity: 0.9,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  closeButton: {
    padding: 4,
    marginLeft: 4,
  },
});
