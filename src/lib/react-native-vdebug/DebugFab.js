/**
 * JS floating debug button (iOS + fallback).
 * Android free-float uses native DebugFloat on decorView.
 *
 * Drag via RN PanResponder (no RNGH arena fights with lists).
 */
import React, {useCallback, useMemo, useRef} from 'react';
import {
    PanResponder,
    StyleSheet,
    Text,
    View,
} from 'react-native';

export default function DebugFab({
    onToggle,
    left = 0,
    top = 0,
    onPositionChange,
}) {
    const originRef = useRef({left, top});
    const startRef = useRef({x: 0, y: 0});
    const draggedRef = useRef(false);
    const posRef = useRef({left, top});

    // Keep refs in sync when parent passes a new origin (e.g. after open).
    originRef.current = {left, top};
    posRef.current = {left, top};

    const commit = useCallback(
        (nextLeft, nextTop) => {
            const l = Math.max(0, Math.round(nextLeft));
            const t = Math.max(0, Math.round(nextTop));
            posRef.current = {left: l, top: t};
            onPositionChange?.(l, t);
        },
        [onPositionChange],
    );

    const panResponder = useMemo(
        () =>
            PanResponder.create({
                onStartShouldSetPanResponder: () => true,
                onMoveShouldSetPanResponder: (_, g) =>
                    Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
                onPanResponderTerminationRequest: () => false,
                onShouldBlockNativeResponder: () => true,
                onPanResponderGrant: () => {
                    draggedRef.current = false;
                    startRef.current = {
                        x: posRef.current.left,
                        y: posRef.current.top,
                    };
                },
                onPanResponderMove: (_, g) => {
                    if (Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2) {
                        draggedRef.current = true;
                    }
                    const nextLeft = Math.max(0, startRef.current.x + g.dx);
                    const nextTop = Math.max(0, startRef.current.y + g.dy);
                    posRef.current = {left: nextLeft, top: nextTop};
                    // Live update through parent state
                    onPositionChange?.(
                        Math.round(nextLeft),
                        Math.round(nextTop),
                    );
                },
                onPanResponderRelease: (_, g) => {
                    if (draggedRef.current) {
                        commit(
                            startRef.current.x + g.dx,
                            startRef.current.y + g.dy,
                        );
                    } else {
                        onToggle?.();
                    }
                    setTimeout(() => {
                        draggedRef.current = false;
                    }, 30);
                },
            }),
        [commit, onPositionChange, onToggle],
    );

    return (
        <View
            collapsable={false}
            style={[styles.btn, {left, top}]}
            {...panResponder.panHandlers}>
            <Text style={styles.text}>调试</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    btn: {
        position: 'absolute',
        zIndex: 100002,
        elevation: 100002,
        width: 60,
        minHeight: 36,
        paddingVertical: 6,
        paddingHorizontal: 4,
        backgroundColor: '#04be02',
        borderRadius: 4,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.25,
        shadowRadius: 3,
    },
    text: {
        color: '#fff',
        fontWeight: '600',
    },
});
