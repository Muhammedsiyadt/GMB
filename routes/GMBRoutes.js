const multer = require("multer");
const AuthController = require("../controllers/AuthControllers");
const GMBController = require("../controllers/GMBControllers");
const AuthMiddleware = require('../middleware/AuthMiddleware');
const router = require("express").Router();
const path = require('path');
const fs = require('fs');
const serpApi = require('../SerpApi/serpIndex')

// Configure storage for multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

router.get('/get-locations', AuthMiddleware, AuthController.gmbaccounts);
router.get('/get-location', AuthMiddleware, AuthController.singleDetails);
router.get('/get-location-places', AuthMiddleware, AuthController.getPlaceDetailsById);
router.get('/reply-to-review', AuthMiddleware, AuthController.addReplay);
router.post('/post', upload.single('avatar'), AuthMiddleware, GMBController.createPost);


router.get('/all-posts', AuthMiddleware, GMBController.allPosts);
router.post('/saveKeyword', AuthMiddleware, GMBController.addKeywords);
router.delete('/keywords/:id', AuthMiddleware, GMBController.deleteKeyword);
router.delete('/location/:id', AuthMiddleware, GMBController.deleteLocation);
router.post('/search-location', AuthMiddleware, GMBController.searchLocations);
router.post('/checkPermission', AuthMiddleware, GMBController.checkPermission);
router.post('/grid', AuthMiddleware, GMBController.GMBRank);
router.post('/updateRank', AuthMiddleware, GMBController.updateKeywordRank);
router.get('/getGMBAccountID', AuthMiddleware, GMBController.updateKeywordRank);


router.get('/get-viewers/:id', GMBController.getAllViewers); 
router.get('/get-locationData/:locationId', GMBController.getlocationData)
router.get('/get-allviewers/:id', GMBController.getAllReviews); 
router.post('/replay-review/:accountId/:locationId/:selectedId', AuthController.replayReview);

router.post('/fetchRank', serpApi.fetchRank)
// router.post('/fetchmapDetails', GMBController.fetchmapDetails)

router.get('/findlocation/:locationId', GMBController.findLocation)

router.post('/schedulepost', upload.single('avatar'), AuthMiddleware, GMBController.createSchedulePost); 
router.post('/schedulepost2', upload.single('avatar'), AuthMiddleware, GMBController.createSchedulePost2); 
router.get('/scheduled-posts/:id', GMBController.getAllScheledPosts); 
router.put('/edit/scheduled-posts/:id', upload.single('image'), GMBController.editScheduledPosts); 
router.delete('/delete/scheduled-posts/:id', GMBController.deleteScheledPosts); 

// KEYWORDS
router.get('/get-keywords/:id', GMBController.getKeywords);
router.put('/editKeywords/:currentRecord', GMBController.editKeyword)
router.delete('/deleteKeywords/:id', GMBController.deleteKeyword) 
router.get('/get-all-keywords-count', GMBController.keywordCount)

// BULK POSTING
router.get('/get-allLocations', GMBController.getLocations)
router.post('/create-bulk-posts', upload.single('avatar'), GMBController.createBulkPost)
router.post('/create-bulk-aiPosts', upload.single('avatar'), AuthMiddleware, GMBController.createbulkAiPost);


module.exports = router;