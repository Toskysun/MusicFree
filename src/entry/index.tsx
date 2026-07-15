import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import bootstrap from "./bootstrap/bootstrap";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Dialogs from "@/components/dialogs";
import Panels from "@/components/panels";
import { panelInfoStore } from "@/components/panels/usePanel";
import PageBackground from "@/components/base/pageBackground";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Debug from "@/components/debug";
import { PortalHost } from "@/components/base/portal";
import globalStyle from "@/constants/globalStyle";
import Theme from "@/core/theme";
import { BootstrapComponent } from "./bootstrap/BootstrapComponent";
import { ToastBaseComponent } from "@/components/base/toast";
import { StatusBar, StyleSheet, View } from "react-native";
import { ReduceMotion, ReducedMotionConfig } from "react-native-reanimated";
import { routes } from "@/core/router/routes.tsx";
import ErrorBoundary from "@/components/errorBoundary";
import { NotificationLifecycleManager } from "@/core/notificationLifecycleManager";
import { appendStartupBreadcrumb } from "@/utils/log";

StatusBar.setBackgroundColor("transparent");
StatusBar.setTranslucent(true);
void appendStartupBreadcrumb("entry-module-loaded");
void appendStartupBreadcrumb("statusbar-configured");
void appendStartupBreadcrumb("bootstrap-dispatch");

// MMKV-backed theme values are available synchronously. Resolve them before
// the first React render so light/custom launches do not paint the dark
// fallback while the asynchronous bootstrap performs migrations and setup.
try {
    Theme.setup();
} catch {
    // bootstrap() retries theme setup after Config.setup() has completed.
}
bootstrap();

const Stack = createNativeStackNavigator<any>();

export default function Pages() {
    const theme = Theme.useTheme();
    const panelInfo = panelInfoStore.useValue();
    // Freeze the navigator while a panel overlay is open so Android Fabric +
    // native-stack cannot receive presses through the absolute panel layer.
    const blockBackground = panelInfo.name != null;
    // RN Navigation 7 requires theme.fonts; custom themes may lack it.
    const navigationTheme = React.useMemo(() => {
        const fonts = theme?.fonts ?? {
            regular: { fontFamily: "sans-serif", fontWeight: "normal" as const },
            medium: {
                fontFamily: "sans-serif-medium",
                fontWeight: "normal" as const,
            },
            bold: { fontFamily: "sans-serif", fontWeight: "600" as const },
            heavy: { fontFamily: "sans-serif", fontWeight: "700" as const },
        };
        return { ...theme, fonts };
    }, [theme]);

    React.useEffect(() => {
        void appendStartupBreadcrumb("pages-mounted");

        return () => {
            void appendStartupBreadcrumb("pages-unmounted");
        };
    }, []);

    return (
        <GestureHandlerRootView style={globalStyle.flex1}>
            {/*
              ONE flex:1 box. App fills it. Debug is an absolute overlay child
              of the same box (not a flex sibling). That way a tall log sheet
              cannot reflow / lift the music bar.

              Android free FAB is a native decorView child (same HWUI surface).
            */}
            <View style={styles.root}>
                <SafeAreaProvider style={globalStyle.flex1}>
                    <NavigationContainer theme={navigationTheme as any}>
                        <ErrorBoundary>
                            <BootstrapComponent />
                            <NotificationLifecycleManager />
                            <ReducedMotionConfig mode={ReduceMotion.Never} />
                            <PageBackground />
                            <View
                                style={globalStyle.flex1}
                                pointerEvents={
                                    blockBackground ? "none" : "auto"
                                }
                                collapsable={false}>
                                <Stack.Navigator
                                    initialRouteName={routes[0].path}
                                    screenOptions={{
                                        headerShown: false,
                                        animation: "slide_from_right",
                                        animationDuration: 100,
                                    }}>
                                    {routes.map(route => (
                                        <Stack.Screen
                                            key={route.path}
                                            name={route.path}
                                            component={route.component}
                                        />
                                    ))}
                                </Stack.Navigator>
                            </View>
                            <Panels />
                            <Dialogs />
                            <ToastBaseComponent />
                            <PortalHost />
                        </ErrorBoundary>
                    </NavigationContainer>
                </SafeAreaProvider>
                <Debug />
            </View>
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
});
