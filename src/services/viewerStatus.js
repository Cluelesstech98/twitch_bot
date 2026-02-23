function getViewerStatus(tags) {
    const badges = tags.badges || {};
    return {
        isBroadcaster: badges.broadcaster === '1',
        isMod: tags.mod || badges.broadcaster === '1',
        isVIP: badges.vip === '1',
        isSubscriber: badges.subscriber === '1' || badges.founder === '1',
        isFollower: false,
        isViewer: true,
    };
}
module.exports = { getViewerStatus };