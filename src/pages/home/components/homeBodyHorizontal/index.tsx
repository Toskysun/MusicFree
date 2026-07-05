import React from "react";
import globalStyle from "@/constants/globalStyle";
import Operations from "./operations";
import { View } from "react-native";
import Sheets from "../homeBody/sheets";
import HomeHero from "../HomeHero";
import { useAppConfig } from "@/core/appConfig";
import HomeOverview from "../homeBody/homeOverview";

export default function HomeBodyHorizontal() {
    const homeLayout = useAppConfig("theme.homeLayout") ?? "classic";
    const hideHomeHeroCard = useAppConfig("theme.hideHomeHeroCard") ?? false;
    const hideHomeOperations = useAppConfig("theme.hideHomeOperations") ?? false;

    if (homeLayout === "overview") {
        return <HomeOverview />;
    }

    return (
        <View style={globalStyle.rowfwflex1}>
            {!hideHomeOperations && <Operations />}
            <View style={globalStyle.fwflex1}>
                <Sheets header={!hideHomeHeroCard ? <HomeHero /> : undefined} />
            </View>
        </View>
    );
}
