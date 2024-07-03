// Modules to control application life and create native browser window
const { app, BrowserWindow, Tray, Menu, nativeTheme, nativeImage, Notification } = require('electron')
const path = require('node:path')

function addHoursToDateTime(baseDateTime, hoursToAdd) {
  const [datePart, timePart] = baseDateTime.split(' ');
  const [year, month, day] = datePart.split('/');
  let [hours, minutes, seconds] = timePart.split(':');
  // 如果小于8:30则重置为8:30
  if (parseInt(hours) <= 8 && parseInt(minutes) < 30) {
    hours = '08';
    minutes = '30'
    seconds = '00';
  }
  console.log(hours, minutes)
  const dateTime = new Date(year, month - 1, day, hours, minutes, seconds);
  const resultDateTime = new Date(dateTime.getTime() + hoursToAdd * 3600000);

  const yyyy = resultDateTime.getFullYear();
  const MM = String(resultDateTime.getMonth() + 1).padStart(2, '0');
  const dd = String(resultDateTime.getDate()).padStart(2, '0');
  const HH = String(resultDateTime.getHours()).padStart(2, '0');
  const mm = String(resultDateTime.getMinutes()).padStart(2, '0');
  const ss = String(resultDateTime.getSeconds()).padStart(2, '0');

  return `${yyyy}/${MM}/${dd} ${HH}:${mm}:${ss}`;
};
let tray = null
let mainWindow = null
let intervalId = null;

// 在状态栏添加图标
function createTray() {
  const iconPath = path.join(__dirname, 'icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '打开主窗口',
      click: () => {
        if (!mainWindow) {
          createWindow();
        } else {
          mainWindow.show();
        }
      },
    },
    {
      label: '刷新',
      click: () => {
        resetWindow()
      },
    },
    {
      label: '退出',
      click: () => {
        app.isQuiting = true;
        if (tray) tray.destroy();
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);
  return tray;
}
// 创建窗口
function createWindow () {
  mainWindow = new BrowserWindow({
    show: false,
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // 启用上下文隔离
      enableRemoteModule: false, // 禁用远程模块
      nodeIntegration: false // 禁用Node.js集成
    }
  })
  mainWindow.loadURL('https://www.italent.cn')
  process.env.NODE_ENV === 'development' && mainWindow.webContents.openDevTools()
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`
      (async () => {
        try {
          function getTodayRange(symbol) {
            const today = new Date();
            const yyyy = today.getFullYear();
            const MM = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            const dateStr = yyyy + '/' + MM + '/' + dd
            return dateStr + symbol + dateStr
          }
          const res = await fetch("https://cloud.italent.cn/api/v2/UI/TableList?viewName=Attendance.SingleObjectListView.EmpAttendanceDataList&metaObjName=Attendance.AttendanceStatistics&app=Attendance&PaaS-SourceApp=Attendance&PaaS-CurrentView=Attendance.AttendanceDataRecordNavView&shadow_context=%7BappModel%3A%22italent%22%2Cuppid%3A%221%22%7D", {
            headers: {
              "accept": "application/json, application/xml, text/play, text/html, */*",
              "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
              "content-type": "application/json; charset=utf-8",
              "eagleeye-traceid": "0bf639ae-8db9-4d21-a35e-4021864b0337",
              "sec-ch-ua": \`"Not/A)Brand";v="8", "Chromium";v="126"\`,
              "sec-ch-ua-mobile": "?0",
              "sec-ch-ua-platform": \`"macOS"\`,
              "sec-fetch-dest": "empty",
              "sec-fetch-mode": "cors",
              "sec-fetch-site": "same-site",
              "x-sourced-by": "ajax",
              "Referer": "https://www.italent.cn/",
            },
            body: JSON.stringify({
              search_data: {
                metaObjName: "Attendance.AttendanceStatistics",
                searchView: "Attendance.EmpAttendanceDataSearch",
                items: [
                  { name: "Attendance.AttendanceStatistics.StaffId", text: "", value: "", num: "1", metaObjName: "", metaFieldRelationIDPath: "", queryAreaSubNodes: false },
                  { name: "Attendance.AttendanceStatistics.StdIsDeleted", text: "否", value: "0", num: "5", metaObjName: "", metaFieldRelationIDPath: "", queryAreaSubNodes: false },
                  { name: "Attendance.AttendanceStatistics.Status", text: "启用", value: "1", num: "6", metaObjName: "", metaFieldRelationIDPath: "", queryAreaSubNodes: false },
                  {
                    metaFieldRelationIDPath: "",
                    metaObjName: "",
                    name: "Attendance.AttendanceStatistics.SwipingCardDate",
                    num: "2",
                    queryAreaSubNodes: false,
                    text: getTodayRange('~'),
                    value: getTodayRange('-')
                  }
                ],
                searchFormFilterJson: null
              }
            }),
            method: "POST"
          });
          if (!res.ok) return null;
          const resJson = await res.json();
          const { ActualForFirstCard, ActualForLastCard } = resJson?.biz_data[0];
          return {
            start: ActualForFirstCard?.value,
            end: ActualForLastCard?.value
          }
        } catch (error) {
          console.error('Error fetching data:', error);
        }
      })();
    `).then((cardTime) => {
      const { start, end } = cardTime
      if(!start) return tray.setTitle('暂无数据，点击刷新')
      if (end) {
        return tray.setTitle(`昨日下班已打卡：${end.split(' ')[1]}`)
      }
      const offDutyTime = addHoursToDateTime(start, 9.5)
      const getShowStr = (text, timeDifference) => {
        const hours = Math.floor((timeDifference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((timeDifference % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((timeDifference % (1000 * 60)) / 1000);
        const _hours = hours < 10 ? '0' + hours : hours;
        const _minutes = minutes < 10 ? '0' + minutes : minutes;
        const _seconds = seconds < 10 ? '0' + seconds : seconds;
        const srt = `${text}：${_hours}:${_minutes}:${_seconds}`
        return srt
      };
      const targetDate = new Date(offDutyTime).getTime();
      let hasShownEndMessage = false;
      let haveGotSupper = false;
      intervalId && clearInterval(intervalId);
      // 更新倒计时的函数
      async function updateCountdown () {
        const now = new Date().getTime();
        const timeRemaining = targetDate - now;
        const tolerance = 1000; // 允许1秒的误差范围
        if (timeRemaining > tolerance) {
          tray.setTitle(getShowStr('距离下班还有', timeRemaining));
          hasShownEndMessage = false;
        } else if (timeRemaining <= tolerance && timeRemaining > -tolerance) {
          if (!hasShownEndMessage) {
            tray.setTitle('今日工时已达标');
            new Notification({
              title: '今日工时已达标',
              body: '下班别忘记打卡哦~'
            }).show();
            hasShownEndMessage = true;
          }
        } else {
          const overtimeHours = now - targetDate;
          tray.setTitle(getShowStr('你已加班', overtimeHours));
          hasShownEndMessage = false
          // 如果加班了一个半小时，如果在一分钟内通知一下
          if (overtimeHours / 1000 / 60 > 90 && overtimeHours / 1000 / 60 < 91) {
            if (!haveGotSupper) {
              new Notification({
                title: '加班餐成就 +1',
                body: '你已加班一个半小时，赶快下班吧~'
              }).show();
              haveGotSupper = true;
            }
          }
          // 如果当天时间是23:59:59，判断清除定时器
          if (new Date().getHours() === 23 && new Date().getMinutes() === 59 && new Date().getSeconds() === 59) {
            intervalId && clearInterval(intervalId);
            resetWindow()
          }
        }
      }
      updateCountdown();
      intervalId = setInterval(updateCountdown, 1000);

    }).catch((error) => {
      console.error('Error executing script:', error);
    });
  });
  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return true;
  });
}

// 设置一个间隔任务，每24小时刷新一次窗口
function scheduleTask() {
    const now = new Date();
    const targetTime = new Date();
    targetTime.setHours(10, 0, 0, 0);
    if (now > targetTime) {
      targetTime.setDate(targetTime.getDate() + 1);
    }
    const timeDifference = targetTime.getTime() - now.getTime();
    setTimeout(() => {
      resetWindow()
      setInterval(() => {
        resetWindow()
      }, 24 * 60 * 60 * 1000);
    }, timeDifference);
}

function resetWindow() {
  if (mainWindow) {
    mainWindow.close();
  }
  tray.setTitle('加载中...')
  createWindow();
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createTray()
  createWindow()
  scheduleTask()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
  if (process.platform === 'darwin') {
    app.dock.hide();
  }
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})


// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

// 监听主题变化
nativeTheme.on('updated', () => {

});

