import { useState, useRef, useEffect } from "react";
import { SafeAreaView, Button, Text, View, Alert, Dimensions, FlatList, ScrollView, TextInput, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard } from "react-native";
import { WebView } from "react-native-webview";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import * as MediaLibrary from "expo-media-library";
import * as FileSystem from "expo-file-system";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import moment from "moment-timezone";
import styles from "./styles";

const SCREEN_WIDTH = Dimensions.get("window").width;

export default function App() {
	const [data, setData] = useState("");
	const [obys, tryObys] = useState(0);
	const [status, setStatus] = useState("Not Logged In");
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [isWebViewVisible, setIsWebViewVisible] = useState(false);
	const [logs, setLogs] = useState([]);
	const webviewRef = useRef(null);
	const LAST_DATA_KEY = "@lastData";

	const addLog = async message => {
		const timestamp = moment().tz("Europe/Istanbul").format("DD-MM-YYYY HH:mm:ss");
		const newLog = `${timestamp} - ${message}`;
		const fileUri = `${FileSystem.documentDirectory}logs.txt`;
		const fileInfo = await FileSystem.getInfoAsync(fileUri);
		console.log(newLog);

		if (fileInfo.exists) {
			const existingLogs = await FileSystem.readAsStringAsync(fileUri);
			const updatedLogs = existingLogs + newLog + "\n";
			await FileSystem.writeAsStringAsync(fileUri, updatedLogs);
		} else {
			await FileSystem.writeAsStringAsync(fileUri, newLog + "\n");
		}

		setLogs(prevLogs => [...prevLogs, newLog]);
	};

	Notifications.setNotificationHandler({
		handleNotification: async () => ({
			shouldShowAlert: true,
			shouldPlaySound: true,
			shouldSetBadge: false,
		}),
	});

	const sendNotification = async message => {
		await Notifications.scheduleNotificationAsync({
			content: {
				title: "gradechecker",
				body: message,
			},
			trigger: null,
		});
	};

	useEffect(() => {
		const subscription = Notifications.addNotificationResponseReceivedListener(response => {
			const message = response.notification.request.content.body;
			Clipboard.setStringAsync(message);
			Alert.alert("Copied!", "Notification text copied to clipboard.");
		});

		return () => subscription.remove();
	}, []);

	const handleSaveData = async newData => {
		if (newData.length < 5) {
			addLog("Empty newData bug occurred.");
			await sendNotification("Empty newData bug occurred.");
			return;
		} else {
			newData = newData
				.split("\n")
				.reduce((acc, line, index, array) => {
					const trimmedLine = line.trim();

					if (!trimmedLine.includes(",") && trimmedLine !== "" && index + 1 < array.length) {
						const nextLine = array[index + 1].trim();
						if (nextLine.includes(",")) {
							acc.push(`${trimmedLine},${nextLine.replace(/,00/g, "").replace(/^-[^,]+,/, "")}`);
						}
					} else if (trimmedLine.includes(",") && !trimmedLine.startsWith("-")) {
						acc.push(trimmedLine.replace(/,00/g, ""));
					}
					return acc;
				}, [])
				.filter(line => line.trim() !== "" && !line.startsWith("-"))
				.map(line => {
					return line.replace(/,([^,]+)$/, (match, p1) => {
						return p1.includes(".") ? match : `.${p1}`;
					});
				})
				.join("\n");

			setData(newData);
		}

		try {
			const lastData = await AsyncStorage.getItem(LAST_DATA_KEY);

			if (lastData) {
				if (lastData !== newData) {
					const newRows = newData.split("\n");
					const lastRows = lastData.split("\n");

					let changesDetected = false;
					let differences = [];

					const whatwhat = ["Ders adı", "Devam Durumu", "Vize", "Final", "Başarı Notu", "Büt", "Harf Notu", "Sınıf Ortalaması"];

					for (let i = 0; i < newRows.length; i++) {
						const newRow = newRows[i].split(",");
						const lastRow = lastRows[i] ? lastRows[i].split(",") : [];

						for (let j = 0; j < newRow.length; j++) {
							if (newRow[j] !== lastRow[j]) {
								changesDetected = true;
								differences.push({
									column: j + 1,
									newValue: newRow[j],
									changedlesson: newRow[0],
								});
							}
						}
					}

					if (changesDetected) {
						addLog("Data has changed. Changes are:");
						differences.forEach(diff => {
							const columnName = whatwhat[diff.column - 1];
							addLog(`${diff.changedlesson} ${columnName} yeni değeri: "${diff.newValue}"`);
							sendNotification(`${diff.changedlesson} ${columnName} yeni değeri: "${diff.newValue}"`);
						});
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
		await SecureStore.setItemAsync("username", username);
		await SecureStore.setItemAsync("password", password);
	};

	const firstLogin = () => {
		webviewRef.current.injectJavaScript(`
            document.getElementById("username").value = "${username}";
            document.getElementById("password").value = "${password}";        
            checkAccountType(document.getElementById("username"));
            setTimeout(() => {
                document.getElementById("login-submit").click();
            }, 500);
        `);
	};

	const clickOnNotGoruntuleme = () => {
		webviewRef.current.injectJavaScript(`
            const link = document.querySelector('a[href="/Redirect/Redirect?AppEncId=z3Td%2Fth1x8vcvHw%2BDyN0G7GVy9eklCUQxjzDjMFwZaI%3D"]');
            link.target = "_self";
            link.click();
        `);
	};

	const importGrades = () => {
		webviewRef.current.injectJavaScript(`
            let semesterIndex = 0;
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
        `);
	};

	const changeObys = () => {
		webviewRef.current.injectJavaScript(`
            const currentUrl = window.location.href;
            if (${obys > 9}) {
                window.ReactNativeWebView.postMessage(false);
                return;
            } else if (${obys == 1}) {
                const newUrl = currentUrl.replace(/obys\d\.ege\.edu\.tr/, "obys1.ege.edu.tr");
            } else {
                const newUrl = currentUrl.replace("obys${obys - 1}.ege.edu.tr", "obys${obys}.ege.edu.tr");
            }
            
            window.location.href = newUrl;            
        `);
	};

	const pageFromUrl = url => {
		if (!url) return "unknown";
		const u = url.toLowerCase();
		if (u.startsWith("https://kimlik.ege.edu.tr/identity/account/login")) return "login";
		if (u === "https://kimlik.ege.edu.tr/" || u === "https://kimlik.ege.edu.tr") return "home";
		if (u.includes("ogrenci")) return "grades";
		if (u.includes("obys")) return "obys";
		return "unknown";
	};

	const onNavigationStateChange = navState => {
		const page = pageFromUrl(navState.url);

		switch (page) {
			case "login":
				if (username && password) {
					firstLogin();
					setStatus("Giriş yapılıyor...");
				} else {
					setIsWebViewVisible(false);
					setStatus("Öğrenci no veya şifre girilmedi.");
					alert("Giriş yapmak için ayarlardan öğrenci no ve şifre girmelisin.");
					addLog("Öğrenci no veya şifre girilmedi.");
				}
				break;

			case "home":
				clickOnNotGoruntuleme();
				setStatus("Not görüntüleme açılıyor...");
				break;

			case "grades":
				importGrades();
				break;

			case "obys":
				addLog("Obys Değiştiriliyor...");
				tryObys(obys + 1);
				changeObys();
				setStatus("OBYS numarası değiştiriliyor...");
				break;

			default:
				addLog("Sayfa bulunamadı.");
		}
	};

	useEffect(() => {
		const initializeApp = async () => {
			try {
				await MediaLibrary.requestPermissionsAsync();
				await Notifications.requestPermissionsAsync();

				const savedUsername = await SecureStore.getItemAsync("username");
				const savedPassword = await SecureStore.getItemAsync("password");
				const savedData = await AsyncStorage.getItem(LAST_DATA_KEY);
				const fileUri = `${FileSystem.documentDirectory}logs.txt`;

				savedUsername ? setUsername(savedUsername) : addLog("No username found.");
				savedPassword ? setPassword(savedPassword) : addLog("No password found.");
				savedData ? (addLog("Loaded saved data."), setData(savedData)) : addLog("No saved data found.");

				try {
					const fileInfo = await FileSystem.getInfoAsync(fileUri);
					if (fileInfo.exists) {
						const fileContent = await FileSystem.readAsStringAsync(fileUri);
						setLogs(fileContent.split("\n").filter(line => line.trim() !== ""));
					}
				} catch (error) {
					addLog("Error loading logs:", error);
				}
			} catch (error) {
				addLog("Error loading saved data:", error);
			}
		};

		initializeApp();
	}, []);

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

							<View style={styles.inputWrapper}>
								<Text style={styles.inputLabel}>Username</Text>
								<TextInput style={styles.input} value={username} onChangeText={text => setUsername(text)} onBlur={saveCredentials} placeholder="Enter username" placeholderTextColor="#888" />
							</View>

							<View style={styles.inputWrapper}>
								<Text style={styles.inputLabel}>Password</Text>
								<TextInput style={styles.input} value={password} onChangeText={text => setPassword(text)} onBlur={saveCredentials} placeholder="Enter password" placeholderTextColor="#888" secureTextEntry />
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
								return (
									<Text key={index} style={styles.lineText}>
										{line}
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
					<Button
						title="run the script"
						onPress={() => {
							setIsWebViewVisible(true);
						}}
						color="#4CAF50"
						style={styles.button}
					/>
					<Text style={styles.status}>Status: {status}</Text>
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
							javaScriptEnabled
							userAgent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
							startInLoadingState
							onNavigationStateChange={onNavigationStateChange}
							style={{ flex: 1, marginTop: 100, width: SCREEN_WIDTH * 0.95, height: 750, maxHeight: 635 }}
							onMessage={event => {
								const fetchedData = event.nativeEvent.data;
								if (fetchedData === false) {
									addLog("OBYS numaraları 9'a ulaştı, işlem sonlandırılıyor...");
									setStatus("OBYS numaraları 9'a ulaştı, işlem sonlandırılıyor...");
								} else {
									handleSaveData(fetchedData);
									setIsWebViewVisible(false);
									setStatus("Başarıyla tamamlandı!");
								}
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
			<FlatList data={pages} horizontal pagingEnabled renderItem={renderPage} keyExtractor={item => item.key} showsHorizontalScrollIndicator={false} initialScrollIndex={2} getItemLayout={(data, index) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index })} />
		</SafeAreaView>
	);
}
