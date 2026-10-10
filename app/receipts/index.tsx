import { View, Text } from "react-native";
import { colors } from "../../src/theme/colors";
import { poppins } from "../../src/theme/fonts";

export default function ReceiptsScreen() {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: colors.background,
        padding: 24,
      }}
    >
      <Text style={{ color: colors.text, fontSize: 24, ...poppins("700") }}>Receipts Screen</Text>
    </View>
  );
}
