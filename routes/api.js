const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const locationHelper = require('../helpers/location-helper');
const projectHelper = require('../helpers/project-helper');

router.get('/locations', auth.requireLogin, async (req, res, next) => {
  try {
    const locations = await locationHelper.getLocations();
    return res.json({ success: true, locations });
  } catch (error) {
    return next(error);
  }
});

router.get('/admin/summary', auth.requireLogin, auth.requireRole('Admin'), async (req, res, next) => {
  try {
    const locations = await locationHelper.getLocations();
    const totalProjects = await projectHelper.getProjectCount();
    const progressSummary = await projectHelper.getProjectProgressSummary();
    return res.json({
      success: true,
      summary: {
        totalZones: locations.totalZones || 10,
        totalCircles: locations.totalCircles || 49,
        totalUnits: locations.totalUnits || 498,
        totalProjects,
        progressSummary,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/admin/projects', auth.requireLogin, auth.requireRole('Admin'), async (req, res, next) => {
  try {
    const projects = await projectHelper.getAllProjects();
    return res.json({ success: true, projects });
  } catch (error) {
    return next(error);
  }
});

router.post('/admin/projects', auth.requireLogin, auth.requireRole('Admin'), async (req, res, next) => {
  try {
    const { name, description, zone, circle, unit } = req.body;
    if (!name || !zone || !circle || !unit) {
      return res.status(400).json({ success: false, message: 'Project name and location are required.' });
    }
    const insertedId = await projectHelper.createProject({ name, description, zone, circle, unit });
    const project = await projectHelper.getProjectById(insertedId);
    return res.json({ success: true, project });
  } catch (error) {
    return next(error);
  }
});

router.put('/admin/projects/:id', auth.requireLogin, auth.requireRole('Admin'), async (req, res, next) => {
  try {
    const updated = await projectHelper.updateProject(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

router.delete('/admin/projects/:id', auth.requireLogin, auth.requireRole('Admin'), async (req, res, next) => {
  try {
    const deleted = await projectHelper.deleteProject(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

router.get('/user/projects', auth.requireLogin, async (req, res, next) => {
  try {
    const { zone, circle, unit } = req.query;
    const projects = await projectHelper.getProjectsBySelection(zone, circle, unit);
    return res.json({ success: true, projects });
  } catch (error) {
    return next(error);
  }
});

router.put('/projects/:id/completion', auth.requireLogin, async (req, res, next) => {
  try {
    const completed = req.body.completed === true || req.body.completed === 'true';
    const updated = await projectHelper.setProjectCompletion(req.params.id, completed);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
