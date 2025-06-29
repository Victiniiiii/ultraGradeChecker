import { useState, useRef, useEffect, useCallback, useMemo } from "react";
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
const LAST_DATA_KEY = "@lastData";
const MAX_OBYS_COUNT = 9;
const NAVIGATION_TIMEOUT = 5000;
const GRADE_EXTRACTION_TIMEOUT = 8000;

const PAGE_PATTERNS = {
	login: /kimlik\.ege\.edu\.tr\/identity\/account\/login/i,
	home: /^https:\/\/kimlik\.ege\.edu\.tr\/?$/i,
	grades: /ogrenci/i,
	obys: /obys\d+\.ege\.edu\.tr/i,
};

export default function App() {
	const [data, setData] = useState("");
	const [obys, setObys] = useState(1);
	const [status, setStatus] = useState("Not Logged In");
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [isWebViewVisible, setIsWebViewVisible] = useState(false);
	const [logs, setLogs] = useState([]);
	const [currentPage, setCurrentPage] = useState("unknown");
	const [navigationTimeout, setNavigationTimeout] = useState(null);
	const [isProcessing, setIsProcessing] = useState(false);
	const [gradeExtractionAttempts, setGradeExtractionAttempts] = useState(0);

	const webviewRef = useRef(null);

	const gradeColumns = useMemo(() => ["Ders adı", "Devam Durumu", "Vize", "Final", "Başarı Notu", "Büt", "Harf Notu", "Sınıf Ortalaması"], []);

	const addLog = useCallback(async (message, data = null) => {
		const timestamp = moment().tz("Europe/Istanbul").format("DD-MM-YYYY HH:mm:ss");
		const logMessage = data ? `${message} ${JSON.stringify(data)}` : message;
		const newLog = `${timestamp} - ${logMessage}`;

		console.log(newLog);
		setLogs(prevLogs => [newLog, ...prevLogs.slice(0, 999)]);

		try {
			const fileUri = `${FileSystem.documentDirectory}logs.txt`;
			const fileInfo = await FileSystem.getInfoAsync(fileUri);

			if (fileInfo.exists) {
				const existingLogs = await FileSystem.readAsStringAsync(fileUri);
				const updatedLogs = newLog + "\n" + existingLogs;
				await FileSystem.writeAsStringAsync(fileUri, updatedLogs);
			} else {
				await FileSystem.writeAsStringAsync(fileUri, newLog + "\n");
			}
		} catch (error) {
			console.error("Failed to write log:", error);
		}
	}, []);

	useEffect(() => {
		Notifications.setNotificationHandler({
			handleNotification: async () => ({
				shouldShowAlert: true,
				shouldPlaySound: true,
				shouldSetBadge: false,
			}),
		});
	}, []);

	const sendNotification = useCallback(
		async message => {
			try {
				await Notifications.scheduleNotificationAsync({
					content: {
						title: "gradechecker",
						body: message,
					},
					trigger: null,
				});
			} catch (error) {
				await addLog("Failed to send notification:", error.message, ".");
			}
		},
		[addLog]
	);

	useEffect(() => {
		const subscription = Notifications.addNotificationResponseReceivedListener(response => {
			const message = response.notification.request.content.body;
			Clipboard.setStringAsync(message);
			Alert.alert("Copied!", "Notification text copied to clipboard.");
		});

		return () => subscription.remove();
	}, []);

	const processGradeData = useCallback(rawData => {
		if (!rawData || rawData.length < 5) {
			return null;
		}

		return rawData
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
	}, []);

	const handleSaveData = useCallback(
		async newData => {
			const processedData = processGradeData(newData);

			if (!processedData) {
				await addLog("Empty or invalid data received.");
				await sendNotification("Empty or invalid data received.");
				return;
			}

			setData(processedData);

			try {
				const lastData = await AsyncStorage.getItem(LAST_DATA_KEY);

				if (lastData && lastData !== processedData) {
					const newRows = processedData.split("\n");
					const lastRows = lastData.split("\n");
					const differences = [];

					const maxRows = Math.max(newRows.length, lastRows.length);

					for (let i = 0; i < maxRows; i++) {
						const newRow = newRows[i] ? newRows[i].split(",") : [];
						const lastRow = lastRows[i] ? lastRows[i].split(",") : [];
						const maxCols = Math.max(newRow.length, lastRow.length);

						for (let j = 0; j < maxCols; j++) {
							if (newRow[j] !== lastRow[j]) {
								differences.push({
									rowIndex: i,
									columnIndex: j,
									columnName: gradeColumns[j] || `Column ${j + 1}`,
									newValue: newRow[j] || "Empty",
									oldValue: lastRow[j] || "Empty",
									courseName: newRow[0] || "Unknown Course",
								});
							}
						}
					}

					if (differences.length > 0) {
						for (const diff of differences) {
							const message = `${diff.courseName} ${diff.columnName}: "${diff.oldValue}" → "${diff.newValue}"`;
							await addLog(message);
							await sendNotification(message);
						}
					} else {
						await addLog("Data unchanged.");
						await sendNotification("Data unchanged.");
					}
				} else if (!lastData) {
					await addLog("Initial data saved.");
					await sendNotification("Initial data saved.");
				} else {
					await addLog("Data unchanged.");
					await sendNotification("Data unchanged.");
				}

				await AsyncStorage.setItem(LAST_DATA_KEY, processedData);

				const filePath = `${FileSystem.documentDirectory}data.csv`;
				await FileSystem.writeAsStringAsync(filePath, processedData, {
					encoding: FileSystem.EncodingType.UTF8,
				});

				await addLog("Data saved successfully.");
			} catch (error) {
				await addLog("Failed to save data: ", error.message, ".");
			}
		},
		[processGradeData, addLog, sendNotification, gradeColumns]
	);

	const saveCredentials = useCallback(async () => {
		try {
			await Promise.all([SecureStore.setItemAsync("username", username), SecureStore.setItemAsync("password", password)]);
			await addLog("Credentials saved.");
		} catch (error) {
			await addLog("Failed to save credentials: ", error.message, ".");
		}
	}, [username, password, addLog]);

	const detectPageFromUrl = useCallback(url => {
		if (!url) return "unknown";

		const normalizedUrl = url.toLowerCase();

		for (const [pageName, pattern] of Object.entries(PAGE_PATTERNS)) {
			if (pattern.test(normalizedUrl)) {
				return pageName;
			}
		}

		return "unknown";
	}, []);

	const injectLoginCredentials = useCallback(() => {
		const script = `
			(function() {
				try {
					const usernameField = document.getElementById("username");
					const passwordField = document.getElementById("password");
					const submitButton = document.getElementById("login-submit");
					
					if (usernameField && passwordField && submitButton) {
						usernameField.value = "${username}";
						passwordField.value = "${password}";
						
						if (typeof checkAccountType === 'function') {
							checkAccountType(usernameField);
						}
						
						setTimeout(() => {
							submitButton.click();
						}, 500);
						
						window.ReactNativeWebView.postMessage('login_injected');
					} else {
						window.ReactNativeWebView.postMessage('login_fields_not_found');
					}
				} catch (error) {
					window.ReactNativeWebView.postMessage('login_error:' + error.message);
				}
			})();
		`;

		webviewRef.current?.injectJavaScript(script);
	}, [username, password]);

	const injectGradeNavigation = useCallback(() => {
		const script = `
			(function() {
				try {
					const links = [
						'a[href="/Redirect/Redirect?AppEncId=z3Td%2Fth1x8vcvHw%2BDyN0G7GVy9eklCUQxjzDjMFwZaI%3D"]',
						'a[href*="ogrenci"]',
						'a[href*="Ogrenci"]',
						'a[href*="NotGoruntuleme"]'
					];
					
					let linkFound = false;
					for (const selector of links) {
						const link = document.querySelector(selector);
						if (link) {
							link.target = "_self";
							link.click();
							linkFound = true;
							break;
						}
					}
					
					if (!linkFound) {
						window.ReactNativeWebView.postMessage('navigation_link_not_found');
					}
				} catch (error) {
					window.ReactNativeWebView.postMessage('navigation_error:' + error.message);
				}
			})();
		`;

		webviewRef.current?.injectJavaScript(script);
	}, []);

	const injectGradeExtraction = useCallback(() => {
		const script = `
			(function() {
				try {
					function waitForElements(callback, maxAttempts = 50) {
						let attempts = 0;
						const checkElements = () => {
							attempts++;
							const firstElement = document.querySelector('[id*="rptGrup_ctl"][id*="_rptDers_ctl"][id*="_tdDersAdi"]');
							
							if (firstElement || attempts >= maxAttempts) {
								callback(firstElement);
							} else {
								setTimeout(checkElements, 200);
							}
						};
						checkElements();
					}
					
					waitForElements((found) => {
						if (!found) {
							window.ReactNativeWebView.postMessage('no_grade_elements_found');
							return;
						}
						
						let data = [];
						let coursesFound = 0;
						
						const allGradeElements = document.querySelectorAll('[id*="rptGrup_ctl"][id*="_rptDers_ctl"][id*="_tdDersAdi"]');
						
						allGradeElements.forEach((element) => {
							try {
								const idParts = element.id.match(/rptGrup_ctl(\\d+)_rptDers_ctl(\\d+)_tdDersAdi/);
								if (!idParts) return;
								
								const semesterIndex = idParts[1];
								const courseIndex = idParts[2];
								const baseId = \`rptGrup_ctl\${semesterIndex}_rptDers_ctl\${courseIndex}\`;
								
								const row = [];
								const selectors = [
									"_tdDersAdi", "_tdDevamDurumu", "_tdYid", "_divFinalNotu",
									"_tdBn", "_tdBut", "_tdHbn", "_tdSinifOrtalamasi"
								];
								
								let validRow = false;
								for (const selector of selectors) {
									const el = document.getElementById(baseId + selector);
									const value = el ? el.innerText.trim() : "";
									row.push(value);
									if (value && selector === "_tdDersAdi") validRow = true;
								}
								
								if (validRow && row[0]) {
									data.push(row);
									coursesFound++;
								}
							} catch (err) {
								console.log('Error processing element:', err);
							}
						});
						
						if (coursesFound > 0) {
							const csvData = data.map(row => row.join(",")).join("\\n");
							window.ReactNativeWebView.postMessage('extraction_success:' + csvData);
						} else {
							window.ReactNativeWebView.postMessage('no_valid_courses_found');
						}
					});
				} catch (error) {
					window.ReactNativeWebView.postMessage('extraction_error:' + error.message);
				}
			})();
		`;

		webviewRef.current?.injectJavaScript(script);
	}, []);

	const injectObysChange = useCallback(() => {
		const script = `
			(function() {
				try {
					const currentUrl = window.location.href;
					if (${obys} > ${MAX_OBYS_COUNT}) {
						window.ReactNativeWebView.postMessage('max_obys_reached');
						return;
					}
					
					let newUrl;
					if (${obys} === 1) {
						newUrl = currentUrl.replace(/obys\\d+\\.ege\\.edu\\.tr/, "obys1.ege.edu.tr");
					} else {
						newUrl = currentUrl.replace("obys${obys - 1}.ege.edu.tr", "obys${obys}.ege.edu.tr");
					}
					
					if (newUrl !== currentUrl) {
						window.location.href = newUrl;
						window.ReactNativeWebView.postMessage('obys_changing');
					} else {
						window.ReactNativeWebView.postMessage('obys_change_failed');
					}
				} catch (error) {
					window.ReactNativeWebView.postMessage('obys_error:' + error.message);
				}
			})();
		`;

		webviewRef.current?.injectJavaScript(script);
	}, [obys]);

	const forceGradeExtraction = useCallback(() => {
		setGradeExtractionAttempts(prev => prev + 1);
		addLog(`Force grade extraction attempt ${gradeExtractionAttempts + 1}.`);

		setTimeout(() => {
			injectGradeExtraction();
		}, 2000);

		if (gradeExtractionAttempts >= 2) {
			addLog("Max extraction attempts reached, trying next OBYS.");
			setGradeExtractionAttempts(0);
			if (obys <= MAX_OBYS_COUNT) {
				setObys(prev => prev + 1);
				injectObysChange();
			} else {
				setStatus("All OBYS servers checked.");
				setIsWebViewVisible(false);
			}
		}
	}, [gradeExtractionAttempts, obys, addLog, injectGradeExtraction, injectObysChange]);

	const handleNavigation = useCallback(
		async (page, url) => {
			if (isProcessing) return;

			setCurrentPage(page);

			if (navigationTimeout) {
				clearTimeout(navigationTimeout);
			}

			const timeoutDuration = page === "grades" ? GRADE_EXTRACTION_TIMEOUT : NAVIGATION_TIMEOUT;
			const timeout = setTimeout(() => {
				addLog("Navigation timeout, forcing next step.");
				setIsProcessing(false);

				if (page === "grades") {
					forceGradeExtraction();
				}
			}, timeoutDuration);

			setNavigationTimeout(timeout);
			setIsProcessing(true);

			try {
				switch (page) {
					case "login":
						if (username && password) {
							await addLog("Injecting login credentials.");
							setStatus("Logging in...");
							setTimeout(() => injectLoginCredentials(), 1000);
						} else {
							setIsWebViewVisible(false);
							setStatus("Username or password not provided");
							Alert.alert("Error", "Please enter username and password in settings");
							await addLog("Login failed - missing credentials.");
						}
						break;

					case "home":
						await addLog("Navigating to grades.");
						setStatus("Opening grade view...");
						setTimeout(() => injectGradeNavigation(), 2000);
						break;

					case "grades":
						await addLog("Extracting grades.");
						setStatus("Extracting grades...");
						setGradeExtractionAttempts(0);
						setTimeout(() => injectGradeExtraction(), 3000);
						break;

					case "obys":
						if (obys <= MAX_OBYS_COUNT) {
							await addLog("Changing OBYS", { current: obys, next: obys + 1 }, ".");
							setStatus(`Trying OBYS ${obys + 1}...`);
							setObys(prev => prev + 1);
							setTimeout(() => injectObysChange(), 1000);
						} else {
							await addLog("Max OBYS reached.");
							setStatus("All OBYS servers checked");
							setIsWebViewVisible(false);
						}
						break;

					default:
						await addLog("Unknown page detected", { page, url }, ".");
						setStatus("Unknown page - waiting...");
				}
			} finally {
				setTimeout(() => {
					setIsProcessing(false);
					if (navigationTimeout) {
						clearTimeout(navigationTimeout);
						setNavigationTimeout(null);
					}
				}, 1000);
			}
		},
		[isProcessing, navigationTimeout, username, password, obys, addLog, injectLoginCredentials, injectGradeNavigation, injectGradeExtraction, injectObysChange, forceGradeExtraction]
	);

	const onNavigationStateChange = useCallback(
		async navState => {
			const page = detectPageFromUrl(navState.url);
			if (page !== currentPage) {
				await handleNavigation(page, navState.url);
			}
		},
		[detectPageFromUrl, currentPage, handleNavigation]
	);

	const onWebViewMessage = useCallback(
		async event => {
			const message = event.nativeEvent.data;

			if (message === "max_obys_reached") {
				await addLog("Max OBYS reached, process completed.");
				setStatus("All OBYS servers checked");
				setIsWebViewVisible(false);
			} else if (message === "no_grade_elements_found" || message === "no_valid_courses_found") {
				await addLog("No grades found on this page.");
				if (obys <= MAX_OBYS_COUNT) {
					setObys(prev => prev + 1);
					injectObysChange();
				} else {
					setStatus("No grades found on any OBYS server");
					setIsWebViewVisible(false);
				}
			} else if (message.startsWith("extraction_success:")) {
				const gradeData = message.replace("extraction_success:", "");
				await handleSaveData(gradeData);
				setIsWebViewVisible(false);
				setStatus("Successfully completed!");
			} else if (message.startsWith("extraction_error:") || message.startsWith("login_error:")) {
				await addLog("WebView error", { error: message }, ".");
				setStatus("Error occurred - check logs");
			} else if (message && message.length > 10 && !message.includes("_") && !message.includes(":")) {
				await handleSaveData(message);
				setIsWebViewVisible(false);
				setStatus("Successfully completed!");
			}
		},
		[addLog, handleSaveData, obys, injectObysChange]
	);

	useEffect(() => {
		const initializeApp = async () => {
			try {
				const [mediaPermission, notificationPermission] = await Promise.all([MediaLibrary.requestPermissionsAsync(), Notifications.requestPermissionsAsync()]);
				const [savedUsername, savedPassword, savedData] = await Promise.all([SecureStore.getItemAsync("username"), SecureStore.getItemAsync("password"), AsyncStorage.getItem(LAST_DATA_KEY)]);

				if (savedUsername) setUsername(savedUsername);
				if (savedPassword) setPassword(savedPassword);
				if (savedData) {
					setData(savedData);
					await addLog("Loaded saved data.");
				}

				try {
					const fileUri = `${FileSystem.documentDirectory}logs.txt`;
					const fileInfo = await FileSystem.getInfoAsync(fileUri);
					if (fileInfo.exists) {
						const fileContent = await FileSystem.readAsStringAsync(fileUri);
						const logLines = fileContent
							.split("\n")
							.filter(line => line.trim() !== "")
							.slice(0, 100);
						setLogs(logLines);
					}
				} catch (error) {
					await addLog("Error loading logs: ", error.message, ".");
				}
			} catch (error) {
				await addLog("Error initializing app: ", error.message, ".");
			}
		};

		initializeApp();
	}, [addLog]);

	const startGradeCheck = useCallback(() => {
		setObys(1);
		setGradeExtractionAttempts(0);
		setIsWebViewVisible(true);
		setStatus("Starting grade check...");
	}, [addLog]);

	const renderPage = useCallback(({ item }) => {
		return <View style={[styles.page, { backgroundColor: item.backgroundColor }]}>{item.content}</View>;
	}, []);

	const pages = useMemo(
		() => [
			{
				key: "data",
				backgroundColor: "#144",
				content: (
					<View style={styles.dataPage}>
						<Text style={styles.title}>Data</Text>
						{data ? (
							<ScrollView contentContainerStyle={styles.scrollContent}>
								{data.split("\n").map((line, index) => (
									<Text key={index} style={styles.lineText}>
										{line}
									</Text>
								))}
							</ScrollView>
						) : (
							<Text style={styles.textPlace}>No data available. Run the script to fetch data.</Text>
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
						<Button title={isWebViewVisible ? "Script Running..." : "Run the Script"} onPress={startGradeCheck} color="#4CAF50" disabled={isWebViewVisible || !username || !password} />
						<Text style={styles.status}>Status: {status}</Text>

						<KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : null}>
							<TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
								<View>
									<View style={styles.inputWrapper}>
										<Text style={styles.inputLabel}>Username: </Text>
										<TextInput style={styles.input} value={username} onChangeText={setUsername} onBlur={saveCredentials} placeholder="Enter username" placeholderTextColor="#888" autoCapitalize="none" autoCorrect={false} />
									</View>
									<View style={styles.inputWrapper}>
										<Text style={styles.inputLabel}>Password: </Text>
										<TextInput style={styles.input} value={password} onChangeText={setPassword} onBlur={saveCredentials} placeholder="Enter password" placeholderTextColor="#888" secureTextEntry autoCapitalize="none" autoCorrect={false} />
									</View>
								</View>
							</TouchableWithoutFeedback>
						</KeyboardAvoidingView>

						<View style={styles.webviewSlot}>{isWebViewVisible && <WebView ref={webviewRef} source={{ uri: "https://kimlik.ege.edu.tr/Identity/Account/Login?ReturnUrl=%2F" }} javaScriptEnabled domStorageEnabled userAgent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" startInLoadingState onNavigationStateChange={onNavigationStateChange} onMessage={onWebViewMessage} style={styles.webview} onError={e => addLog("WebView error: ", e, ".")} onHttpError={e => addLog("WebView HTTP error: ", e, ".")} />}</View>
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
							{logs.map((log, index) => (
								<Text key={index} style={styles.logText}>
									{log}
								</Text>
							))}
						</ScrollView>
					</View>
				),
			},
		],
		[username, password, data, status, currentPage, obys, gradeExtractionAttempts, isWebViewVisible, logs, saveCredentials, startGradeCheck, onNavigationStateChange, onWebViewMessage, addLog]
	);

	return (
		<SafeAreaView style={styles.container}>
			<FlatList
				data={pages}
				horizontal
				pagingEnabled
				renderItem={renderPage}
				keyExtractor={item => item.key}
				showsHorizontalScrollIndicator={false}
				initialScrollIndex={1}
				getItemLayout={(data, index) => ({
					length: SCREEN_WIDTH,
					offset: SCREEN_WIDTH * index,
					index,
				})}
				removeClippedSubviews={true}
				maxToRenderPerBatch={3}
				windowSize={3}
			/>
		</SafeAreaView>
	);
}
