import React from 'react';
import { withTranslation } from 'react-i18next';

import { Box, Button, withStyles } from '@material-ui/core';
import CircularProgress from '@material-ui/core/CircularProgress';
import SyncIcon from '@material-ui/icons/Sync';

import { getPwaSettings, getLangCodePrefix } from '../../../utils/settings';
import { getNode } from '../../../utils/node';

import 'regenerator-runtime/runtime';

const ResultMessage = withStyles(theme => ({
  root: {
    fontSize: '0.8rem',
    marginTop: theme.spacing(1),
    color: '#ffab00',
  },
}))(Box);

class DownloadCourse extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      result: null,
      loading: false,
    };

    this.handleDownload = this.handleDownload.bind(this);
    this.saveUrlToCache = this.saveUrlToCache.bind(this);
    this.cacheLessonsAndReturnLessonImages = this.cacheLessonsAndReturnLessonImages.bind(this);
    this.getParagraphImagesFromContent = this.getParagraphImagesFromContent.bind(this);
  }

  /**
   * Parses lesson content to get list of paragraph image urls.
   */
  getParagraphImagesFromContent(pageContent) {
    const regExpString = /<script type="application\/json" data-drupal-selector="drupal-settings-json">(.*?)<\/script>/g;
    const regExpResult = regExpString.exec(pageContent);
    const lessonJson = JSON.parse(regExpResult[1]);

    // Get Lesson object from page json data.
    const lessonNode = getNode(lessonJson.node);
    const paragraphUrls = [];

    // Gather lesson images.
    if (lessonNode.type === 'module_lesson') {
      lessonNode.sections.map(section => {
        section.map(paragraph => {

          for (const [key, value] of Object.entries(paragraph)) {
            if (typeof value === 'object' && value.type && value.type === 'image') {
              paragraphUrls.push(value.url);
            }
          }
        })
      })
    }

    // Gather assessment images.
    if (lessonNode.type === 'module_assessment') {
      lessonNode.items.map(item => {
        for (const [key, value] of Object.entries(item)) {
          if (typeof value === 'object' && value.type && value.type === 'image') {
            paragraphUrls.push(value.url);
          }
        }
      })
    }

    return paragraphUrls;
  }

  /**
   * Cache lessons and returns list of lesson images (from paragraphs) to cache.
   */
  async cacheLessonsAndReturnLessonImages(lessonUrls) {
    return Promise.all(lessonUrls.map(async url => {
      // Makes request to get lessons data.
      const request = new Request(url);
      const response = await fetch(request, { mode: 'no-cors' });
      const responseClone = response.clone();
      // Parse lesson content to get Lesson json data.
      const responseContent = await response.text();
      const paragraphUrls = this.getParagraphImagesFromContent(responseContent);
      // Put lesson to the pwa cache.
      const cacheName = getPwaSettings().current_cache;
      const cache = await caches.open(cacheName);

      await cache.put(request, responseClone);

      // Returns parsed lesson paragraph urls.
      return paragraphUrls;
    }));
  }

  async handleDownload() {
    const { course } = this.props;
    let urlsToCache = [];

    // Indicate loading process.
    this.setState({ loading: true });

    try {
      // Cache some global pages.
      urlsToCache.push(`${getLangCodePrefix()}/`);
      urlsToCache.push(`${getLangCodePrefix()}/courses`);

      // Cache Course data.
      urlsToCache.push(getLangCodePrefix() + course.path);

      if (course.image && course.image.url) {
        urlsToCache.push(course.image.url);
      }

      // Prepare Module related urls to cache.
      let lessonUrls = [];
      const moduleUrls = course.modules.map(module => {
        const urls = [];

        // Cache Module data.
        urls.push(getLangCodePrefix() + module.path);
        if (module.image && module.image.url) {
          urls.push(module.image.url);
        }

        // Find Module's lessons and return as a result,
        // they will be cached separately.
        const moduleLessonUrls = module.lessons.map((lesson) => getLangCodePrefix() + lesson.path);
        lessonUrls = lessonUrls.concat(moduleLessonUrls);

        // Add Module's assessment.
        if (module.assessment && module.assessment.id) {
          lessonUrls.push(getLangCodePrefix() + module.assessment.path);
        }

        return urls;
      });

      // Add Module data for caching.
      urlsToCache = urlsToCache.concat(moduleUrls.flat());

      // Cache lessons and returns list of lesson images (from paragraphs) to cache.
      const lessonImageUrls = await this.cacheLessonsAndReturnLessonImages(lessonUrls);
      urlsToCache = urlsToCache.concat(lessonImageUrls.flat());

      // Save collected urls to cache.
      await this.saveUrlToCache(urlsToCache);

      // Updates loading status.
      this.setState({ loading: false, result: 'success' });
    } catch (error) {
      // Updates loading status.
      this.setState({ loading: false, result: 'error' });
      console.error(`Could not download course content: ${error}`);
    }
  }

  /**
   * Save passed urls to the pwa cache.
   */
  async saveUrlToCache(urls) {
    return Promise.all(urls.map(async (url) => {
      // Makes request to get data.
      const request = new Request(url);
      const response = await fetch(request, { mode: 'no-cors' });
      const responseClone = response.clone();

      // Put response to the pwa cache.
      const cacheName = getPwaSettings().current_cache;
      const cache = await caches.open(cacheName);
      await cache.put(request, responseClone);
    }));
  }

  render() {
    const { t } = this.props;
    const { loading, result } = this.state;

    return (
      <>
        <Button
          variant="outlined"
          color="primary"
          startIcon={<SyncIcon />}
          onClick={this.handleDownload}
          disabled={loading}
          style={{ width: 'max-content' }}
        >
          {t('Make available offline')}

          {loading && <CircularProgress size={24} style={{ position: 'absolute' }} />}
        </Button>

        {result && result === 'success' && (
          <ResultMessage>
            {t('Successfully downloaded to your device!')}
          </ResultMessage>
        )}

        {result && result === 'error' && (
          <ResultMessage>
            {t('Could not download the course. Please contact site administrator.')}
          </ResultMessage>
        )}
      </>
    );
  }
}

export default withTranslation()(DownloadCourse);
