window.OneSignalDeferred = window.OneSignalDeferred || [];
OneSignalDeferred.push(async function(OneSignal) {
    await OneSignal.init({
        appId: "91cdf62f-fbb3-406c-b10e-ea632651b4cf",
        safari_web_id: "web.onesignal.auto...",
        notifyButton: {
            enable: true,
        },
    });
});
