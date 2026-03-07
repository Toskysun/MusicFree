/**
 * @format
 */

import { registerRootComponent } from "expo";
import TrackPlayer from "react-native-track-player";
import Pages from "@/entry";

registerRootComponent(Pages);
TrackPlayer.registerPlaybackService(() => require("./src/service/index"));
