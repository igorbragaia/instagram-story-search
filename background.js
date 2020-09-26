chrome.webRequest.onCompleted.addListener(
    (details) => {
        if (!(details.initiator || ``).startsWith(`chrome-extension`))
            fetchAllData(details.url).then(data => console.log(data))
    },
    {
        urls: [`*://www.instagram.com/graphql/query/?query_hash=90709b530ea0969f002c86a89b4f2b8d*`]
    }
)

parseDataChunkUrl = (url, storyViewerCursor) => {
    return url.replace(/story_viewer_cursor%22%3A%22[0-9]*%22%2C%22/, `story_viewer_cursor%22%3A%22${storyViewerCursor}%22%2C%22`)
}

fetchDataChunk = async (url) => {
    return new Promise((resolve, reject) => {
        fetch(url)
            .then(res => res.json())
            .then(res => {
                // #TODO understand what is reels_media and if we need to loop over all items as well
                return res.data.reels_media[0].items.map(item => {
                    const storyId = item.id
                    const chunkViewersUsername = item.edge_story_media_viewers.edges.map(edge => edge.node.username)
                    const viewersCount = item.edge_story_media_viewers.count
                    return { storyId, chunkViewersUsername, viewersCount }
                })
            })
            .then(resolve)
            .catch(_ => resolve([]))
    })
}

fetchAllData = async (url) => {
    const storiesDataChunk = await fetchDataChunk(url)
    if (storiesDataChunk.length == 0)
        return []

    // Instagram only responds with a chunk of a 50 max viewers.
    // We have to set a story viewer cursor and make multiple requests to get all viewers.
    const maxViewersCount = storiesDataChunk.map(item => item.viewersCount).reduce((a, b) => Math.max(a, b), 0)

    let dataChunkUrls = []
    for (let i = 0; i < maxViewersCount; i += 50) {
        const dataChunkUrl = parseDataChunkUrl(url, i)
        dataChunkUrls.push(dataChunkUrl)
    }

    const promises = dataChunkUrls.map(fetchDataChunk)
    const response = await Promise.all(promises)
        .then((items) => {
            // Merge the list of all response chunks
            return items.reduce((a, b) => [...a, ...b], [])
        })
        .then((items) => {
            // Map all storyId to viewers
            let hashmap = {}
            for (let item of items) {
                if (!hashmap[item.storyId])
                    hashmap[item.storyId] = {}
                for (const username of item.chunkViewersUsername)
                    if (!hashmap[item.storyId][username])
                        hashmap[item.storyId][username] = true
            }
            return hashmap
        })
        .catch((err) => {
            console.log(err)
            return []
        })

    return response
}
