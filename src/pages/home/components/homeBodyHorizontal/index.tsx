import React from "react";
import globalStyle from "@/constants/globalStyle";
import Operations from "./operations";
import { View } from "react-native";
import Sheets from "../homeBody/sheets";
import HomeHero from "../HomeHero";
import { useAppConfig } from "@/core/appConfig";

export default function HomeBodyHorizontal() {
    const hideHomeHeroCard = useAppConfig("theme.hideHomeHeroCard") ?? false;
    const hideHomeOperations = useAppConfig("theme.hideHomeOperations") ?? false;

    return (
        <View style={globalStyle.rowfwflex1}>
            {!hideHomeOperations && <Operations />}
            <View style={globalStyle.fwflex1}>
                <Sheets header={!hideHomeHeroCard ? <HomeHero /> : undefined} />
            </View>
        </View>
    );
}
