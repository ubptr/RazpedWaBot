// Function to check if the device is connected
const isDeviceConnected = async () => {
    try {
        // Replace with actual logic to check if the device is connected
        // For example, you might check the client's status here
        return client.isConnected(); // This is a hypothetical method
    } catch (error) {
        console.error('Error checking device status:', error);
        throw new Error('Error checking device status');
    }
};

// Middleware to check device status
const checkDevice = async (req, res, next) => {
    try {
        const connected = await isDeviceConnected();
        if (connected) {
            return next(); // Proceed to the next middleware or route handler
        } else {
            return res.status(403).send({
                status: false,
                message: 'Device Tidak Tersambung',
            });
        }
    } catch (error) {
        return res.status(500).send({
            status: false,
            message: 'Error checking device status',
            error: error.toString(),
        });
    }
};
module.exports = { checkDevice };