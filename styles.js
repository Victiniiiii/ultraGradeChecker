import { StyleSheet, Dimensions } from "react-native";

const SCREEN_WIDTH = Dimensions.get("window").width;

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#000",
	},
	debugPage: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingTop: 120,
	},
	page: {
		width: SCREEN_WIDTH,
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
	},
	title: {
		fontSize: 24,
		color: "#fff",
		fontWeight: "bold",
		position: "absolute",
		top: 150,
		width: "100%",
		textAlign: "center",
	},
	mainTitle: {
		fontSize: 30,
		color: "#fff",
		fontWeight: "bold",
		textAlign: "center",
		marginBottom: 20,
	},
	mainPage: {
		flex: 1,
		flexDirection: "column",
		justifyContent: "flex-start",
		alignItems: "center",
		padding: 20,
		paddingTop: 150,
	},
	button: {
		backgroundColor: "#4CAF50",
		color: "#fff",
		padding: 15,
		borderRadius: 8,
		marginTop: 20,
	},
	status: {
		fontSize: 18,
		color: "#fff",
		marginTop: 20,
		fontStyle: "italic",
		marginBottom: 40,
	},
	dataPage: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingTop: 220,
		paddingBottom: 20,
	},
	textPlace: {
		color: "white",
		fontSize: 16,
		marginTop: 10,
		padding: 30,
	},
	picker: {
		height: 50,
		color: "#fff",
		backgroundColor: "#555",
		borderRadius: 5,
	},
	settingsContainer: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingTop: 120,
		width: "90%",
	},
	dropdownWrapper: {
		marginVertical: 10,
		width: "80%",
	},
	dropdownWrapper2: {
		marginVertical: 10,
		width: "80%",
		flexDirection: "row",
		alignItems: "center",
	},
	dropdownLabel: {
		fontSize: 16,
		fontWeight: "bold",
		color: "#fff",
		marginBottom: 5,
	},
	lineText: {
		color: "white",
		paddingHorizontal: 20,
		paddingVertical: 5,
	},
	inputWrapper: {
		marginBottom: 20,
		marginVertical: 10,
		width: 250,
		color: "white",
		display: "flex",
		flexDirection: "row",
		justifyContent: "space-around",
		alignItems: "center"
	},
	inputLabel: {
		color: "#fff",
		marginBottom: 8,
	},
	input: {
		width: 130,
		height: 40,
		borderColor: "#666",
		borderWidth: 1,
		borderRadius: 4,
		paddingLeft: 10,
		color: "#fff",
		backgroundColor: "#222",
	},
	logsPage: {
		flex: 1,
		paddingTop: 220,
		paddingHorizontal: 16,
		backgroundColor: "#222",
		alignItems: "center",
		justifyContent: "center",
	},
	logContainer: {
		flex: 1,
		backgroundColor: "#333",
		borderRadius: 8,
		padding: 16,
		marginBottom: 16,
	},
	logText: {
		fontSize: 14,
		color: "#ccc",
		marginBottom: 16,
		marginTop: -8,
	},
	webviewSlot: {
		width: SCREEN_WIDTH * 0.95,
		height: 360,
		maxHeight: 360,
		marginTop: 20,
	},
	webview: {
		flex: 1,
		borderRadius: 8,
		overflow: "hidden",
	},
});

export default styles;
