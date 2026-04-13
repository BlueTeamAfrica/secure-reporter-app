import { View, StyleSheet, SafeAreaView } from "react-native";
import { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export default function Screen({ children }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#0b1020",
  },
  container: {
    flex: 1,
    padding: 24,
  },
});
