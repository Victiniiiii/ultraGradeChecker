import React, { useState, useRef, useEffect } from "react";
import { SafeAreaView, Button, Text, View, StyleSheet, Dimensions, FlatList, Switch, TouchableOpacity, ScrollView, TextInput, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard } from "react-native";
import { WebView } from "react-native-webview";
import { Picker } from "@react-native-picker/picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as TaskManager from "expo-task-manager";
import * as BackgroundFetch from "expo-background-fetch";
import * as MediaLibrary from "expo-media-library";
import * as FileSystem from "expo-file-system";
import * as Notifications from "expo-notifications";
import moment from "moment-timezone";

const SCREEN_WIDTH = Dimensions.get("window").width;

export default function App() {
	const [data, setData] = useState("");
	const [semesterIndex, setSemesterIndex] = useState(0);
	const [status, setStatus] = useState("Not Logged In");
	const [dayCooldown, setDayCooldown] = useState("15 minutes");
	const [nightCooldown, setNightCooldown] = useState("1 hour");
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [isBackgroundTaskEnabled, setIsBackgroundTaskEnabled] = useState(false);
	const [isWebViewVisible, setIsWebViewVisible] = useState(false);
	const webviewRef = useRef(null);
	const [logs, setLogs] = useState([]);

    const LAST_DATA_KEY = "@lastData";
	const BACKGROUND_TASK_NAME = "handleSubmitForm";

	const addLog = async (message) => {
		const timestamp = moment().tz("Europe/Istanbul").format("DD-MM-YYYY HH:mm:ss");
		const newLog = `${timestamp} - ${message}`;
		const fileUri = `${FileSystem.documentDirectory}logs.txt`;

        console.log(newLog);

        const fileInfo = await FileSystem.getInfoAsync(fileUri);

        if (fileInfo.exists) {
            const existingLogs = await FileSystem.readAsStringAsync(fileUri);
            const updatedLogs = existingLogs + newLog + "\n";
            await FileSystem.writeAsStringAsync(fileUri, updatedLogs);
        } else {
            await FileSystem.writeAsStringAsync(fileUri, newLog + "\n");
        }

        setLogs((prevLogs) => [...prevLogs, newLog]);
	};

	TaskManager.defineTask(BACKGROUND_TASK_NAME, async () => {
		addLog("Background task executed.");
		try {
			await handleSubmitForm();
		} catch (error) {
			addLog("Error in background task:", error);
		}
	});

	const registerBackgroundTask = async () => {
		const isTaskRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK_NAME);
		if (isTaskRegistered) {
			await BackgroundFetch.unregisterTaskAsync(BACKGROUND_TASK_NAME);
			addLog("Task unregistered successfully");
		}
		try {
			const interval = isDaytime() ? convertToSeconds(dayCooldown) : convertToSeconds(nightCooldown);
			await BackgroundFetch.registerTaskAsync(BACKGROUND_TASK_NAME, {
				minimumInterval: interval,
				stopOnTerminate: false,
				startOnBoot: true,
			});
			addLog(`Task registered with interval ${interval} seconds.`);
		} catch (error) {
			addLog("Error registering background task:", error);
		}
	};

	const handleToggle = async () => {
		const newState = !isBackgroundTaskEnabled;
		setIsBackgroundTaskEnabled(newState);

		try {
			addLog(`Background task is ${newState ? "enabled" : "disabled"}`);
			await AsyncStorage.setItem("isBackgroundTaskEnabled", JSON.stringify(newState));

			if (newState) {
				await registerBackgroundTask();
			} else {
				await BackgroundFetch.unregisterTaskAsync(BACKGROUND_TASK_NAME);
			}
		} catch (error) {
			addLog("Error handling toggle:", error);
		}
	};

	const convertToSeconds = (timeString) => {
		const [value, unit] = timeString.split(" ");
		if (unit.startsWith("minute")) return parseInt(value) * 60;
		if (unit.startsWith("hour")) return parseInt(value) * 3600;
		return 0;
	};

	const isDaytime = () => {
		const now = moment().tz("Europe/Istanbul");
		const currentHour = now.hour();
		return currentHour >= 7 && currentHour < 23;
	};

    function onPageLoad(callback) {
        if (document.readyState === "complete") {
            callback();
        } else {
            window.addEventListener("load", callback);
        }
    }

	Notifications.setNotificationHandler({
		handleNotification: async () => ({
			shouldShowAlert: true,
			shouldPlaySound: true,
			shouldSetBadge: false,
		}),
	});

	const sendNotification = async (message) => {
		await Notifications.scheduleNotificationAsync({
			content: {
				title: "gradechecker",
				body: message,
			},
			trigger: null,
		});
	};

	const handleSaveData = async (newData) => {
		if (newData.length < 5) {
			addLog("Empty newData bug occurred.");
			await sendNotification("Empty newData bug occurred.");
			return;
		}

		try {
			const lastData = await AsyncStorage.getItem(LAST_DATA_KEY);

			if (lastData) {
				if (lastData !== newData) {
					const newRows = newData.split("\n");
					const lastRows = lastData.split("\n");

					let changesDetected = false;
					let differences = [];

					for (let i = 0; i < newRows.length; i++) {
						const newRow = newRows[i].split(",");
						const lastRow = lastRows[i] ? lastRows[i].split(",") : [];

						for (let j = 0; j < newRow.length; j++) {
							if (newRow[j] !== lastRow[j]) {
								changesDetected = true;
								differences.push({
									row: i + 1,
									column: j + 1,
									oldValue: lastRow[j] || "N/A",
									newValue: newRow[j],
								});
							}
						}
					}

					if (changesDetected) {
						addLog("Data has changed. Changes are:");
						differences.forEach((diff) => {
							addLog(`Row ${diff.row}, Column ${diff.column}: Old Value: "${diff.oldValue}", New Value: "${diff.newValue}"`);
						});
						await sendNotification(`Data has changed. Row ${diff.row}, Column ${diff.column}: Old Value: "${diff.oldValue}", New Value: "${diff.newValue}"`);
					} else {
						addLog("Data is unchanged.");
						await sendNotification("Data is unchanged.");
					}
				} else {
					addLog("Data is unchanged.");
					await sendNotification("Data is unchanged.");
				}
			}

			await AsyncStorage.setItem(LAST_DATA_KEY, newData);

			const filePath = `${FileSystem.documentDirectory}data.csv`;
			await FileSystem.writeAsStringAsync(filePath, newData, {
				encoding: FileSystem.EncodingType.UTF8,
			});

			addLog("Data saved as CSV:", filePath);
		} catch (error) {
			addLog("Failed to save data:", error);
		}
	};

	const saveCredentials = async () => {
		await AsyncStorage.setItem("username", username);
		await AsyncStorage.setItem("password", password);
	};

	const handleSubmitForm = () => {
		setIsWebViewVisible(true);
		setStatus("Logging in...");
        addLog("Logging in...")

		const login = `
                document.getElementById("username").value = "${username}";
                document.getElementById("password").value = "${password}";        
                checkAccountType(document.getElementById("username"));
                setTimeout(() => {
                    document.getElementById("login-submit").click();
                }, 1000);
            `;

		const openPage = `
                const link = document.querySelector('a[href="/Redirect/Redirect?AppEncId=z3Td%2Fth1x8vcvHw%2BDyN0G7GVy9eklCUQxjzDjMFwZaI%3D"]');
                link.target = "_self";
                link.click();                
            `;

		const obys7toobys4 = `
                const currentUrl = window.location.href;
                if (currentUrl.includes("obys7.ege.edu.tr")) {
                    const newUrl = currentUrl.replace("obys7.ege.edu.tr", "obys4.ege.edu.tr");
                    window.location.href = newUrl;
                }
            `;

		const getGrades = `
                let semesterIndex = ${semesterIndex};
                let data = [];
                while (true) {
                    const semesterSelector = "#rptGrup_ctl" + String(semesterIndex).padStart(2, '0') + "_rptDers_ctl00_tdDersAdi";
                    if (document.querySelector(semesterSelector) === null) {
                        break;
                    }
                    let courseIndex = 0;
                    while (true) {
                        const courseSelector = "#rptGrup_ctl" + String(semesterIndex).padStart(2, '0') + "_rptDers_ctl" + String(courseIndex).padStart(2, '0') + "_tdDersAdi";
                        if (document.querySelector(courseSelector) === null) {
                            break;
                        }
                        const row = [];
                        row.push(document.querySelector(courseSelector).innerText.trim());
                        row.push(document.querySelector("#rptGrup_ctl" + String(semesterIndex).padStart(2, '0') + "_rptDers_ctl" + String(courseIndex).padStart(2, '0') + "_tdDevamDurumu").innerText.trim());
                        row.push(document.querySelector("#rptGrup_ctl" + String(semesterIndex).padStart(2, '0') + "_rptDers_ctl" + String(courseIndex).padStart(2, '0') + "_tdYid").innerText.trim());
                        row.push(document.querySelector("#rptGrup_ctl" + String(semesterIndex).padStart(2, '0') + "_rptDers_ctl" + String(courseIndex).padStart(2, '0') + "_divFinalNotu").innerText.trim());
                        row.push(document.querySelector("#rptGrup_ctl" + String(semesterIndex).padStart(2, '0') + "_rptDers_ctl" + String(courseIndex).padStart(2, '0') + "_tdBn").innerText.trim());
                        row.push(document.querySelector("#rptGrup_ctl" + String(semesterIndex).padStart(2, '0') + "_rptDers_ctl" + String(courseIndex).padStart(2, '0') + "_tdBut").innerText.trim());
                        row.push(document.querySelector("#rptGrup_ctl" + String(semesterIndex).padStart(2, '0') + "_rptDers_ctl" + String(courseIndex).padStart(2, '0') + "_tdHbn").innerText.trim());
                        row.push(document.querySelector("#rptGrup_ctl" + String(semesterIndex).padStart(2, '0') + "_rptDers_ctl" + String(courseIndex).padStart(2, '0') + "_tdSinifOrtalamasi").innerText.trim());

                        data.push(row);
                        courseIndex++;
                    }
                    semesterIndex++;
                }

                data = data.map(row => row.join(",")).join("\\n");
                window.ReactNativeWebView.postMessage(data);
            `;
        

		setTimeout(() => {
			webviewRef.current.injectJavaScript(login);
			setStatus("Logged in!");
			addLog("Logged in!");
		}, 2000);

		setTimeout(() => {
			webviewRef.current.injectJavaScript(openPage);
			setStatus("Pressed on the grade page.");
			addLog("Pressed on the grade page.");
		}, 4500);
		/* 
        setTimeout(() => {
            webviewRef.current.injectJavaScript(obys7toobys4);
            setStatus("Changed the URL.");
            addLog("Changed the URL.");
        }, 20000);
        */
		setTimeout(() => {
			webviewRef.current.injectJavaScript(getGrades);
			setStatus("Sent grades to the grades tab.");
			addLog("Sent grades to the grades tab.");
		}, 6500);

		setTimeout(() => {
			setIsWebViewVisible(false);
			addLog("The function has finished running.");
		}, 11000);
	};

	useEffect(() => {
		const initializeApp = async () => {
			try {
				await MediaLibrary.requestPermissionsAsync();
				await Notifications.requestPermissionsAsync();

				const savedUsername = await AsyncStorage.getItem("username");
				const savedPassword = await AsyncStorage.getItem("password");

				const savedState = await AsyncStorage.getItem("isBackgroundTaskEnabled");
				const savedData = await AsyncStorage.getItem(LAST_DATA_KEY);
				const fileUri = `${FileSystem.documentDirectory}logs.txt`;

				if (savedUsername) {
					setUsername(savedUsername);
				}
				if (savedPassword) {
					setPassword(savedPassword);
				}

				if (savedState !== null) {
					setIsBackgroundTaskEnabled(JSON.parse(savedState));
				}

				if (isBackgroundTaskEnabled) {
					registerBackgroundTask();
				}

				if (savedData) {
					addLog("Loaded saved data.");
					setData(savedData);
				} else {
					addLog("No saved data found.");
				}

				try {
					const fileInfo = await FileSystem.getInfoAsync(fileUri);
					if (fileInfo.exists) {
						const fileContent = await FileSystem.readAsStringAsync(fileUri);
						setLogs(fileContent.split("\n").filter((line) => line.trim() !== ""));
					}
				} catch (error) {
					addLog("Error loading logs:", error);
				}
			} catch (error) {
				addLog("Error loading saved data:", error);
			}
		};

		initializeApp();
	}, [dayCooldown, nightCooldown]);

	const renderPage = ({ item }) => {
		return <View style={[styles.page, { backgroundColor: item.backgroundColor }]}>{item.content}</View>;
	};

	const pages = [
		{
			key: "settings",
			content: (
				<KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : null}>
					<TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
						<View style={styles.settingsContainer}>
							<Text style={styles.title}>Settings</Text>

							<View style={styles.dropdownWrapper}>
								<Text style={styles.dropdownLabel}>Day Cooldown</Text>
								<Picker selectedValue={dayCooldown} onValueChange={(value) => setDayCooldown(value)} style={styles.picker}>
									<Picker.Item label="5 minutes" value="5 minutes" />
									<Picker.Item label="10 minutes" value="10 minutes" />
									<Picker.Item label="15 minutes" value="15 minutes" />
									<Picker.Item label="30 minutes" value="30 minutes" />
								</Picker>
							</View>

							<View style={styles.dropdownWrapper}>
								<Text style={styles.dropdownLabel}>Night Cooldown</Text>
								<Picker selectedValue={nightCooldown} onValueChange={(value) => setNightCooldown(value)} style={styles.picker}>
									<Picker.Item label="15 minutes" value="15 minutes" />
									<Picker.Item label="30 minutes" value="30 minutes" />
									<Picker.Item label="1 hour" value="1 hour" />
									<Picker.Item label="2 hours" value="2 hours" />
								</Picker>
							</View>

							<View style={styles.inputWrapper}>
								<Text style={styles.inputLabel}>Username</Text>
								<TextInput style={styles.input} value={username} onChangeText={(text) => setUsername(text)} onBlur={saveCredentials} placeholder="Enter username" />
							</View>

							<View style={styles.inputWrapper}>
								<Text style={styles.inputLabel}>Password</Text>
								<TextInput style={styles.input} value={password} onChangeText={(text) => setPassword(text)} onBlur={saveCredentials} placeholder="Enter password" secureTextEntry />
							</View>
						</View>
					</TouchableWithoutFeedback>
				</KeyboardAvoidingView>
			),
		},
		{
			key: "data",
			backgroundColor: "#144",
			content: (
				<View style={styles.dataPage}>
					<Text style={styles.title}>Data</Text>
					{data ? (
						<ScrollView contentContainerStyle={styles.scrollContent}>
							{data.split("\n").map((line, index) => {
								const cleanedLine = line.replace(/-FEN\.FAK\.SEÇ\.I - FAKÜLTE SEÇMELİ DERSLER I|-İST\.ALAN\.SEÇ\.I - İSTATİSTİK ALAN SEÇMELİ I|-FEN\.FAK\.SEÇ\.II - FAKÜLTE SEÇMELİ DERSLER II|-İST\.ALAN\.SEÇ\.II - İSTATİSTİK ALAN SEÇMELİ II/g, "");

								return (
									<Text key={index} style={styles.lineText}>
										{cleanedLine}
									</Text>
								);
							})}
						</ScrollView>
					) : (
						<Text style={styles.textPlace}>No data available. Fetch data to display here.</Text>
					)}
				</View>
			),
		},
		{
			key: "main",
			backgroundColor: "#133",
			content: (
				<View style={styles.mainPage}>
					<Text style={styles.mainTitle}>gradechecker</Text>
					<Button title="run the script" onPress={handleSubmitForm} color="#4CAF50" style={styles.button} />
					<Text style={styles.status}>Status: {status}</Text>
					<View style={styles.dropdownWrapper2}>
						<Text style={styles.dropdownLabel}>Enable Background Task</Text>
						<Switch value={isBackgroundTaskEnabled} onValueChange={handleToggle} />
					</View>
				</View>
			),
		},
		{
			key: "debug",
			backgroundColor: "#111",
			content: (
				<View style={styles.debugPage}>
					<Text style={styles.title}>Debug WebView</Text>
					{isWebViewVisible && (
						<WebView
							ref={webviewRef}
							source={{ uri: "https://kimlik.ege.edu.tr/Identity/Account/Login?ReturnUrl=%2F" }}
							javaScriptEnabled={true}
							userAgent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
							startInLoadingState={true}
							style={{ flex: 1, marginTop: 100, width: 375, height: 750, maxHeight: 500 }}
							onMessage={(event) => {
								const fetchedData = event.nativeEvent.data;
								addLog("Fetched Data from WebView.");
								setData(fetchedData);
								handleSaveData(fetchedData);
							}}
						/>
					)}
				</View>
			),
		},
		{
			key: "logs",
			backgroundColor: "#222",
			content: (
				<View style={styles.logsPage}>
					<Text style={styles.title}>Logs</Text>
					<ScrollView style={styles.logContainer}>
						{[...logs].reverse().map((log, index) => (
							<Text key={index} style={styles.logText}>
								{log}
							</Text>
						))}
					</ScrollView>
				</View>
			),
		},
	];

	return (
		<SafeAreaView style={styles.container}>
			<FlatList data={pages} horizontal pagingEnabled renderItem={renderPage} keyExtractor={(item) => item.key} showsHorizontalScrollIndicator={false} initialScrollIndex={2} getItemLayout={(data, index) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index })} />
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#000",
	},
    debugPage: {
        flex: 1,
        alignItems: "center",
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
		marginTop: 100,
		marginBottom: 50,
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
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
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
	},
	dataPage: {
		flex: 1,
		justifyContent: "flex-start",
		alignItems: "center",
		paddingTop: 20,
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
		width: "80%",
	},
	inputLabel: {
		color: "#fff",
		marginBottom: 8,
	},
	input: {
		height: 40,
		borderColor: "#ccc",
		borderWidth: 1,
		borderRadius: 4,
		paddingLeft: 10,
		color: "#fff",
		backgroundColor: "#333",
	},
	logsPage: {
		flex: 1,
		padding: 16,
		backgroundColor: "#222",
        alignItems: "center",
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
});
