import Head from 'next/head';
import App from 'next/app';
import { AppProvider } from '@shopify/polaris';
import '@shopify/polaris/styles.css';

class Wrapper extends React.Component {
  render() {
    const { children } = this.props;
    return (
      <React.Fragment>
        <Head>
          <title>Sample App</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta charSet="utf-8" />
        </Head>
        <AppProvider apiKey={API_KEY}>{children}</AppProvider>
      </React.Fragment>
    );
  }
}

class MyApp extends App {
  render() {
    const { Component, pageProps } = this.props;
    return (
      <Wrapper>
        <Component {...pageProps} />
      </Wrapper>
    );
  }
 }
  
 export default MyApp;
